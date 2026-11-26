// Pure-JS QR Code SVG generator (Model 2, Byte mode, ECC Level L, Versions 1..8)
// Zero external dependencies, works completely offline and on file://
window.QL = window.QL || {};

(function () {
  // GF(256) with primitive polynomial 0x11D
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(ecLen) {
    let g = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gfMul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const res = new Uint8Array(data.length + ecLen);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version specs for ECC Level L: [size, totalDataCodewords, ecPerBlock, blocksGroup1, dataPerBlock1, blocksGroup2, dataPerBlock2, alignPositions]
  const VERSIONS = [
    null,
    [21, 19, 7, 1, 19, 0, 0, []],
    [25, 34, 10, 1, 34, 0, 0, [6, 18]],
    [29, 55, 15, 1, 55, 0, 0, [6, 22]],
    [33, 80, 20, 1, 80, 0, 0, [6, 26]],
    [37, 108, 26, 1, 108, 0, 0, [6, 30]],
    [41, 136, 18, 2, 68, 0, 0, [6, 34]],
    [45, 156, 20, 2, 78, 0, 0, [6, 22, 38]],
    [49, 194, 24, 2, 97, 0, 0, [6, 24, 42]]
  ];

  // Format info for ECC Level L (01) and masks 0..7 (precomputed BCH + XOR 0x5412)
  const FORMAT_INFO_L = [
    0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976
  ];

  const VERSION_INFO = {
    7: 0x07c94,
    8: 0x085bc
  };

  function encodeMatrix(text) {
    const bytes = new TextEncoder().encode(text);
    let ver = -1;
    for (let v = 1; v < VERSIONS.length; v++) {
      const capBits = VERSIONS[v][1] * 8;
      // 4 bit mode + 8 bit len + 8*bytes
      if (4 + 8 + bytes.length * 8 <= capBits) {
        ver = v;
        break;
      }
    }
    if (ver === -1) return null;

    const [size, totalData, ecPerBlock, b1, d1, b2, d2, align] = VERSIONS[ver];
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    // Mode 0100 (Byte), Char count (8 bits for V1..V9)
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);

    const maxBits = totalData * 8;
    const termLen = Math.min(4, maxBits - bits.length);
    pushBits(0, termLen);
    while (bits.length % 8 !== 0) bits.push(0);

    const data = new Uint8Array(totalData);
    for (let i = 0; i < bits.length / 8; i++) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
      data[i] = byte;
    }
    let padIdx = bits.length / 8;
    let padToggle = 0;
    while (padIdx < totalData) {
      data[padIdx++] = padToggle ? 0x11 : 0xec;
      padToggle ^= 1;
    }

    // Split into blocks & compute ECC
    const blocks = [];
    const ecs = [];
    let offset = 0;
    for (let i = 0; i < b1; i++) {
      const blk = data.slice(offset, offset + d1);
      offset += d1;
      blocks.push(blk);
      ecs.push(rsEncode(blk, ecPerBlock));
    }
    for (let i = 0; i < b2; i++) {
      const blk = data.slice(offset, offset + d2);
      offset += d2;
      blocks.push(blk);
      ecs.push(rsEncode(blk, ecPerBlock));
    }

    const interleaved = [];
    const maxDataLen = Math.max(d1, d2);
    for (let i = 0; i < maxDataLen; i++) {
      for (const blk of blocks) if (i < blk.length) interleaved.push(blk[i]);
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const ec of ecs) interleaved.push(ec[i]);
    }

    // Build matrix (-1 = empty, 0 = light, 1 = dark)
    const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const func = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, v) => {
      mat[r][c] = v ? 1 : 0;
      func[r][c] = 1;
    };

    const drawFinder = (top, left) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = top + r;
          const cc = left + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const dark = inBox && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setFunc(rr, cc, dark);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Alignment patterns
    for (const r of align) {
      for (const c of align) {
        if ((r < 9 && c < 9) || (r < 9 && c > size - 9) || (r > size - 9 && c < 9)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setFunc(r + dr, c + dc, dark);
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!func[6][i]) setFunc(6, i, i % 2 === 0);
      if (!func[i][6]) setFunc(i, 6, i % 2 === 0);
    }

    // Dark module + reserve format/version areas
    setFunc(size - 8, 8, 1);
    for (let i = 0; i < 9; i++) {
      if (!func[8][i]) setFunc(8, i, 0);
      if (!func[i][8]) setFunc(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (!func[8][size - 1 - i]) setFunc(8, size - 1 - i, 0);
      if (!func[size - 1 - i][8]) setFunc(size - 1 - i, 8, 0);
    }
    if (ver >= 7) {
      const vi = VERSION_INFO[ver];
      for (let i = 0; i < 18; i++) {
        const bit = (vi >> i) & 1;
        const a = Math.floor(i / 3);
        const b = (size - 11) + (i % 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    // Place data bits in zig-zag
    let bitIdx = 0;
    const totalBits = interleaved.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((size - 1 - right) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        const r = upward ? size - 1 - vert : vert;
        for (let lr = 0; lr < 2; lr++) {
          const c = right - lr;
          if (!func[r][c]) {
            let bit = 0;
            if (bitIdx < totalBits) {
              bit = (interleaved[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
              bitIdx++;
            }
            mat[r][c] = bit;
          }
        }
      }
    }

    // Evaluate 8 masks
    const maskCond = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (_, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    ];

    let bestMask = 0;
    let bestPenalty = Infinity;
    let bestMat = null;

    for (let m = 0; m < 8; m++) {
      const test = mat.map((row, r) =>
        row.map((val, c) => (func[r][c] ? val : val ^ (maskCond[m](r, c) ? 1 : 0)))
      );
      // Apply format info
      const fmt = FORMAT_INFO_L[m];
      for (let i = 0; i < 15; i++) {
        const bit = (fmt >> i) & 1;
        if (i < 6) test[i][8] = bit;
        else if (i < 8) test[i + 1][8] = bit;
        else test[size - 15 + i][8] = bit;

        if (i < 8) test[8][size - 1 - i] = bit;
        else if (i < 9) test[8][15 - i] = bit;
        else test[8][14 - i] = bit;
      }

      const pen = penalty(test, size);
      if (pen < bestPenalty) {
        bestPenalty = pen;
        bestMask = m;
        bestMat = test;
      }
    }

    return { size, matrix: bestMat, mask: bestMask, version: ver };
  }

  function penalty(m, size) {
    let score = 0;
    // Rule 1: 5+ consecutive same color
    for (let r = 0; r < size; r++) {
      let runC = 1;
      let runR = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) runC++;
        else {
          if (runC >= 5) score += 3 + (runC - 5);
          runC = 1;
        }
        if (m[c][r] === m[c - 1][r]) runR++;
        else {
          if (runR >= 5) score += 3 + (runR - 5);
          runR = 1;
        }
      }
      if (runC >= 5) score += 3 + (runC - 5);
      if (runR >= 5) score += 3 + (runR - 5);
    }
    // Rule 2: 2x2 blocks
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }
    return score;
  }

  window.QL.qrSvg = function (text, pixelSize = 180) {
    const res = encodeMatrix(text);
    if (!res) return '';
    const { size, matrix } = res;
    const quiet = 2;
    const dim = size + quiet * 2;
    let paths = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${pixelSize}" height="${pixelSize}" role="img" aria-label="QR Code" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff" rx="2"/><path d="${paths}" fill="#111111"/></svg>`;
  };
  window.QL._qrEncode = encodeMatrix;
})();
