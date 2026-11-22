// A tiny stack virtual machine: an interpreter for make.fun's tiny stack ISA,
// written from the ISA spec in the bounty kit. One run answers every instance
// of a set: for each /input/<id>/program.bin (with its input.bin) it writes
// /output/<id>/stdout.bin and /output/<id>/exit.txt.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Runs one program to its end and returns [output, exit code]. The output is
// held as a latin-1 string (one char per byte). A trap ends the run at once
// and its code is the exit code; traps are thrown as their code and caught
// by the caller of the step loop.
function run(prog, inp) {
  const stack = new Int32Array(256);
  const calls = new Int32Array(64);
  const mem = new Int32Array(256);
  let sp = 0; // data stack height
  let csp = 0; // call stack height
  let pc = 0;
  let steps = 0;
  let inPos = 0;
  let out = '';
  const n = prog.length;
  const under = (k) => {
    if (sp < k) throw 2; // stack underflow
  };
  const full = () => {
    if (sp > 255) throw 3; // a push would pass 256 values
  };
  try {
    for (;;) {
      if (steps >= 1_000_000) return [out, 10]; // step limit
      if (pc < 0 || pc >= n) return [out, 9]; // pc outside the program
      const op = prog[pc];
      // Immediate length: PUSH8 1, PUSH32 4, the jumps and CALL 2, else 0.
      // Only real opcodes have a nonzero length, so an unknown byte falls
      // through to the switch's default with the fit check already passed.
      const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
      if (pc + imm >= n) return [out, 9]; // immediate cut off by the end
      steps++;
      const next = pc + 1 + imm;
      pc = next;
      switch (op) {
        case 0x00: // HALT
          return [out, 0];
        case 0x01: // PUSH8: the byte as a signed 8-bit number
          full();
          stack[sp++] = (prog[next - 1] << 24) >> 24;
          break;
        case 0x02: // PUSH32: four bytes, little-endian, signed
          full();
          stack[sp++] =
            prog[next - 4] | (prog[next - 3] << 8) | (prog[next - 2] << 16) | (prog[next - 1] << 24);
          break;
        case 0x03: // POP
          under(1);
          sp--;
          break;
        case 0x04: // DUP
          under(1);
          full();
          stack[sp] = stack[sp - 1];
          sp++;
          break;
        case 0x05: {
          // SWAP
          under(2);
          const t = stack[sp - 1];
          stack[sp - 1] = stack[sp - 2];
          stack[sp - 2] = t;
          break;
        }
        case 0x06: // OVER
          under(2);
          full();
          stack[sp] = stack[sp - 2];
          sp++;
          break;
        case 0x07: {
          // ROT: ( a b c -- b c a )
          under(3);
          const t = stack[sp - 3];
          stack[sp - 3] = stack[sp - 2];
          stack[sp - 2] = stack[sp - 1];
          stack[sp - 1] = t;
          break;
        }
        case 0x17: // NEG
          under(1);
          stack[sp - 1] = -stack[sp - 1];
          break;
        case 0x1b: // NOT
          under(1);
          stack[sp - 1] = ~stack[sp - 1];
          break;
        case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
        case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
        case 0x1e: case 0x20: case 0x21: case 0x22: {
          // The two-operand instructions: pop b (the top), then a.
          under(2);
          const b = stack[sp - 1];
          const a = stack[sp - 2];
          let r;
          switch (op) {
            case 0x10: r = a + b; break; // ADD (the Int32Array store wraps)
            case 0x11: r = a - b; break; // SUB
            case 0x12: r = Math.imul(a, b); break; // MUL: low 32 bits exactly
            case 0x13: // DIV: signed, truncated toward zero
              if (b === 0) throw 4;
              r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
              break;
            case 0x14: // MOD: the remainder takes the sign of a
              if (b === 0) throw 4;
              r = b === -1 ? 0 : a % b;
              break;
            case 0x15: // DIVU: both read as unsigned
              if (b === 0) throw 4;
              r = Math.floor((a >>> 0) / (b >>> 0));
              break;
            case 0x16: // MODU
              if (b === 0) throw 4;
              r = (a >>> 0) % (b >>> 0);
              break;
            case 0x18: r = a & b; break; // AND
            case 0x19: r = a | b; break; // OR
            case 0x1a: r = a ^ b; break; // XOR
            case 0x1c: r = a << b; break; // SHL: the shift count is b mod 32
            case 0x1d: r = a >> b; break; // SHR: arithmetic
            case 0x1e: r = a >>> b; break; // SHRU: logical
            case 0x20: r = a === b ? 1 : 0; break; // EQ
            case 0x21: r = a < b ? 1 : 0; break; // LT: signed
            default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU: unsigned
          }
          stack[sp - 2] = r;
          sp--;
          break;
        }
        case 0x30: case 0x31: case 0x32: {
          // JMP, JZ, JNZ: a signed 16-bit offset from the next instruction.
          const rel = ((prog[next - 2] | (prog[next - 1] << 8)) << 16) >> 16;
          let take = true;
          if (op !== 0x30) {
            under(1);
            const v = stack[--sp];
            take = op === 0x31 ? v === 0 : v !== 0;
          }
          if (take) pc = next + rel;
          break;
        }
        case 0x33: // CALL: an unsigned absolute address
          if (csp >= 64) throw 7; // call stack overflow
          calls[csp++] = next;
          pc = prog[next - 2] | (prog[next - 1] << 8);
          break;
        case 0x34: // RET
          if (csp === 0) throw 8; // nothing to return to
          pc = calls[--csp];
          break;
        case 0x40: { // LOAD
          under(1);
          const addr = stack[sp - 1];
          if (addr < 0 || addr > 255) throw 6;
          stack[sp - 1] = mem[addr];
          break;
        }
        case 0x41: { // STORE: ( v addr -- )
          under(2);
          const addr = stack[sp - 1];
          if (addr < 0 || addr > 255) throw 6;
          mem[addr] = stack[sp - 2];
          sp -= 2;
          break;
        }
        case 0x50: { // PRINT: the value in decimal ASCII
          under(1);
          const text = String(stack[sp - 1]);
          if (out.length + text.length > 65_536) throw 11; // writes none of it
          sp--;
          out += text;
          break;
        }
        case 0x51: // PUTC: one byte, the low 8 bits
          under(1);
          if (out.length >= 65_536) throw 11;
          out += String.fromCharCode(stack[--sp] & 255);
          break;
        case 0x52: // IN: the next input byte, -1 once it is used up
          full();
          stack[sp++] = inPos < inp.length ? inp[inPos++] : -1;
          break;
        case 0x53: // EXIT: the low byte of the value is the code
          under(1);
          return [out, stack[--sp] & 255];
        default:
          throw 5; // unknown opcode
      }
    }
  } catch (e) {
    if (typeof e === 'number') return [out, e];
    throw e;
  }
}

for (const id of readdirSync(IN_DIR).sort()) {
  const prog = readFileSync(join(IN_DIR, id, 'program.bin'));
  const inp = readFileSync(join(IN_DIR, id, 'input.bin'));
  const [out, code] = run(prog, inp);
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), Buffer.from(out, 'latin1'));
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), code + '\n');
}
