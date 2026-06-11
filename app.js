'use strict';

const LOT_SIZE = 100;
const APP_VERSION = '1.4.1';
let lastResult = null;
let deferredPrompt = null;
let swRegistration = null;
let updateWaiting = false;
let isReloadingForUpdate = false;

const $ = (id) => document.getElementById(id);

function digitsOnly(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function parseRupiah(value) {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : 0;
}

function parsePercent(value) {
  const raw = String(value || '').replace(/%/g, '').replace(/\./g, '').replace(',', '.').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function fmtNum(value) {
  return Math.round(Number(value) || 0).toLocaleString('id-ID');
}

function fmtRp(value) {
  return `Rp${fmtNum(value)}`;
}

function fmtPct(value) {
  return `${(Number(value) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatMoneyInput(input) {
  const digits = digitsOnly(input.value);
  input.value = digits ? Number(digits).toLocaleString('id-ID') : '';
}

function normalizePercentInput(input) {
  let value = String(input.value || '').replace(/[^0-9,.]/g, '').replace('.', ',');
  const parts = value.split(',');
  if (parts.length > 2) value = `${parts[0]},${parts.slice(1).join('')}`;
  input.value = value;
}

function formatModeInput(input, mode) {
  if (mode === 'percent') normalizePercentInput(input);
  else formatMoneyInput(input);
}

function getTickSize(price) {
  const p = Number(price) || 0;
  if (p < 200) return 1;
  if (p < 500) return 2;
  if (p < 2000) return 5;
  if (p < 5000) return 10;
  return 25;
}

function isValidPrice(price) {
  const p = Number(price);
  if (!Number.isInteger(p) || p <= 0) return false;
  return p % getTickSize(p) === 0;
}

function nearestValidDown(price) {
  for (let p = Math.floor(price); p > 0; p--) {
    if (isValidPrice(p)) return p;
  }
  return 0;
}

function nearestValidUp(price) {
  const start = Math.ceil(price);
  for (let p = start; p < start + 10000; p++) {
    if (isValidPrice(p)) return p;
  }
  return 0;
}

function nextValidPrice(price) {
  const start = Math.floor(Number(price) || 0) + 1;
  for (let p = start; p < start + 10000; p++) {
    if (isValidPrice(p)) return p;
  }
  throw new Error('Harga berikutnya tidak ditemukan.');
}

function previousValidPrice(price) {
  const start = Math.ceil(Number(price) || 0) - 1;
  for (let p = start; p > 0 && p > start - 10000; p--) {
    if (isValidPrice(p)) return p;
  }
  throw new Error('Harga sebelumnya tidak ditemukan.');
}

function movePriceByTicks(entry, ticks) {
  let price = Number(entry) || 0;
  const step = Number(ticks) || 0;
  if (!Number.isInteger(step)) throw new Error('Jumlah tick harus berupa angka bulat.');
  if (step === 0) return price;
  if (step > 0) {
    for (let i = 0; i < step; i++) price = nextValidPrice(price);
  } else {
    for (let i = 0; i < Math.abs(step); i++) price = previousValidPrice(price);
  }
  return price;
}

function countTicksUp(entry, target) {
  let count = 0;
  let price = entry;
  let guard = 0;
  while (price < target && guard < 500000) {
    price = nextValidPrice(price);
    count++;
    guard++;
  }
  return price === target ? count : 0;
}

function countTicksDown(entry, target) {
  let count = 0;
  let price = entry;
  let guard = 0;
  while (price > target && guard < 500000) {
    price = previousValidPrice(price);
    count++;
    guard++;
  }
  return price === target ? count : 0;
}

function getSLStatus(ticks) {
  if (ticks <= 0) return 'Belum valid';
  if (ticks <= 3) return 'Sangat dekat';
  if (ticks <= 7) return 'Dekat';
  if (ticks <= 15) return 'Sedang';
  return 'Cukup longgar';
}

function sellAt(price, shares, sellFeeRate, taxRate) {
  const gross = Math.round(price * shares);
  const fee = Math.round(gross * sellFeeRate);
  const estimatedTax = Math.round(gross * taxRate);
  const net = gross - fee;
  return { price, gross, fee, estimatedTax, net };
}

function buyCostAt(entryPrice, lots, buyFeeRate) {
  const shares = lots * LOT_SIZE;
  const grossBuy = Math.round(entryPrice * shares);
  const buyFee = Math.round(grossBuy * buyFeeRate);
  const totalCost = grossBuy + buyFee;
  return { shares, grossBuy, buyFee, totalCost };
}

function findTP(entry, shares, totalCost, targetProfit, sellFeeRate, taxRate) {
  let price = entry;
  let guard = 0;
  while (guard < 500000) {
    price = nextValidPrice(price);
    const sell = sellAt(price, shares, sellFeeRate, taxRate);
    const netProfit = sell.net - totalCost;
    if (netProfit >= targetProfit) return { ...sell, netProfit };
    guard++;
  }
  throw new Error('TP tidak ditemukan. Target profit terlalu besar.');
}

function findSL(entry, shares, totalCost, targetLoss, sellFeeRate, taxRate) {
  let price = entry;
  let guard = 0;
  while (guard < 500000) {
    price = previousValidPrice(price);
    const sell = sellAt(price, shares, sellFeeRate, taxRate);
    const netLoss = totalCost - sell.net;
    if (netLoss >= targetLoss) return { ...sell, netLoss };
    guard++;
  }
  throw new Error('SL tidak ditemukan. Target loss membuat harga terlalu dekat nol.');
}

function modeValue(inputId, mode) {
  return mode === 'percent' ? parsePercent($(inputId).value) : parseRupiah($(inputId).value);
}

function readInput() {
  const tpMode = $('tpMode').value;
  const slMode = $('slMode').value;
  return {
    symbol: $('symbol').value.trim().toUpperCase(),
    totalCapital: parseRupiah($('totalCapital').value),
    allocation: parseRupiah($('allocation').value),
    entryPrice: parseRupiah($('entryPrice').value),
    targetProfit: parseRupiah($('targetProfit').value),
    buyFeePct: parsePercent($('buyFee').value),
    sellFeePct: parsePercent($('sellFee').value),
    taxFeePct: parsePercent($('taxFee').value),
    rrRatio: parsePercent($('rrRatio').value),
    manualLotMode: $('manualLotToggle').checked,
    manualLot: parseRupiah($('manualLot').value),
    tpMode,
    tpParam: modeValue('tpParam', tpMode),
    slMode,
    slParam: modeValue('slParam', slMode),
    allocationMode: $('allocationMode').value,
    autoAmount: parseRupiah($('autoAmount').value),
    prevClose: parseRupiah($('prevClose').value),
    autoRejectMode: $('autoRejectMode').value,
    customAraPct: parsePercent($('customAraPct').value),
    customArbPct: parsePercent($('customArbPct').value)
  };
}

function getTargetProfitAmount(input) {
  return input.targetProfit > 0 ? input.targetProfit : input.autoAmount;
}

function shouldAutoFromProfit(input) {
  return !input.manualLotMode
    && input.allocation <= 0
    && input.targetProfit > 0
    && ['tick', 'price', 'percent'].includes(input.tpMode)
    && input.tpParam > 0;
}

function validate(input) {
  const errors = [];
  if (input.entryPrice <= 0) errors.push('Harga entry wajib diisi.');
  if (input.buyFeePct < 0 || input.sellFeePct < 0 || input.taxFeePct < 0) errors.push('Fee tidak boleh negatif.');
  if (input.totalCapital > 0 && input.allocation > 0 && input.allocation > input.totalCapital) errors.push('Position size tidak boleh lebih besar dari dana trading tersedia jika kolom dana trading diisi.');
  if (input.manualLotMode && input.manualLot <= 0) errors.push('Jumlah lot manual wajib diisi jika mode lot manual aktif.');
  if (input.slMode === 'rr' && input.rrRatio <= 0) errors.push('Rasio reward terhadap risk harus lebih besar dari 0.');

  if (input.allocationMode === 'tp_profit') {
    if (getTargetProfitAmount(input) <= 0) errors.push('Target Net Profit wajib diisi untuk menghitung kebutuhan dana beli dari TP.');
    if (!['tick', 'price', 'percent'].includes(input.tpMode)) errors.push('Untuk menghitung kebutuhan dana beli dari target net profit, pilih Jenis TP dalam mode tick, harga, atau persentase.');
  }

  if (input.allocationMode === 'sl_risk') {
    if (input.autoAmount <= 0) errors.push('Risiko Maksimal wajib diisi untuk menghitung position size dari SL.');
    if (!['tick', 'price', 'percent'].includes(input.slMode)) errors.push('Position sizing dari risiko SL membutuhkan Jenis SL dalam mode tick, harga, atau persentase.');
  }

  if (input.allocationMode === 'manual' && input.allocation <= 0 && !input.manualLotMode && input.targetProfit > 0 && !shouldAutoFromProfit(input)) {
    errors.push('Untuk mencari kebutuhan dana beli dari target net profit, isi Target Net Profit lalu pilih Jenis TP tick, harga, atau persentase. Plafon posisi dan dana trading boleh dikosongkan.');
  }

  if (input.entryPrice > 0 && !isValidPrice(input.entryPrice)) {
    const down = nearestValidDown(input.entryPrice);
    const up = nearestValidUp(input.entryPrice);
    errors.push(`Harga entry belum sesuai fraksi BEI. Harga valid terdekat: ${fmtNum(down)} atau ${fmtNum(up)}.`);
  }

  if (input.prevClose > 0 && !isValidPrice(input.prevClose)) {
    const down = nearestValidDown(input.prevClose);
    const up = nearestValidUp(input.prevClose);
    errors.push(`Harga penutupan hari sebelumnya belum sesuai fraksi harga. Harga valid terdekat: ${fmtNum(down)} atau ${fmtNum(up)}.`);
  }

  if (input.autoRejectMode === 'custom' && (input.customAraPct <= 0 || input.customArbPct <= 0)) {
    errors.push('Custom ARA dan ARB harus lebih besar dari 0%.');
  }

  return errors;
}

function priceFromTPMode(input) {
  if (input.tpMode === 'tick') {
    const ticks = Math.floor(input.tpParam);
    if (ticks <= 0) throw new Error('Nilai TP tick harus lebih besar dari 0.');
    return movePriceByTicks(input.entryPrice, ticks);
  }
  if (input.tpMode === 'price') {
    if (input.tpParam <= 0) throw new Error('Harga TP wajib diisi.');
    return nearestValidUp(input.tpParam);
  }
  throw new Error('Mode ini membutuhkan TP berupa tick atau harga.');
}

function priceFromSLMode(input) {
  if (input.slMode === 'tick') {
    const ticks = Math.floor(input.slParam);
    if (ticks <= 0) throw new Error('Nilai SL tick harus lebih besar dari 0.');
    return movePriceByTicks(input.entryPrice, -ticks);
  }
  if (input.slMode === 'price') {
    if (input.slParam <= 0) throw new Error('Harga SL wajib diisi.');
    return nearestValidDown(input.slParam);
  }
  throw new Error('Mode ini membutuhkan SL berupa tick atau harga.');
}

function estimateAutoLots(input, buyFeeRate, sellFeeRate, taxRate, forcedMode = null) {
  const mode = forcedMode || input.allocationMode;
  if (mode === 'manual') return null;

  const costPerLot = buyCostAt(input.entryPrice, 1, buyFeeRate).totalCost;

  if (mode === 'tp_profit') {
    const targetAmount = getTargetProfitAmount(input);
    if (targetAmount <= 0) throw new Error('Target net profit wajib diisi untuk menghitung position size dari TP.');

    if (input.tpMode === 'percent') {
      if (input.tpParam <= 0) throw new Error('Persentase TP wajib lebih besar dari 0.');
      const targetAllocation = Math.ceil(targetAmount / (input.tpParam / 100));
      let lots = Math.max(1, Math.floor(targetAllocation / costPerLot));
      while ((buyCostAt(input.entryPrice, lots, buyFeeRate).totalCost * input.tpParam / 100) < targetAmount && lots < 1000000) lots++;
      return {
        lots,
        basis: `Position size dicari dari target net profit ${fmtRp(targetAmount)}`,
        note: `Position size dihitung dari target net profit ${fmtRp(targetAmount)} dan TP ${fmtPct(input.tpParam)} dari kebutuhan dana beli.`
      };
    }

    const tpPrice = priceFromTPMode(input);
    if (tpPrice <= input.entryPrice) throw new Error('Harga TP untuk position sizing otomatis harus berada di atas harga entry.');

    const profitForLots = (lotCount) => {
      const buy = buyCostAt(input.entryPrice, lotCount, buyFeeRate);
      const sell = sellAt(tpPrice, buy.shares, sellFeeRate, taxRate);
      return sell.net - buy.totalCost;
    };

    const perLotProfit = profitForLots(1);
    if (perLotProfit <= 0) throw new Error('TP terlalu dekat. Net profit per lot masih negatif setelah fee.');
    let lots = Math.max(1, Math.ceil(targetAmount / perLotProfit));
    while (profitForLots(lots) < targetAmount && lots < 1000000) lots++;

    return {
      lots,
      basis: `Position size dicari dari target net profit ${fmtRp(targetAmount)}`,
      note: `Position size dihitung dari entry ${fmtNum(input.entryPrice)} dan TP ${fmtNum(tpPrice)} agar net profit minimal ${fmtRp(targetAmount)}.`
    };
  }

  if (mode === 'sl_risk') {
    if (input.autoAmount <= 0) throw new Error('Risiko Maksimal wajib diisi untuk menghitung position size dari SL.');

    if (input.slMode === 'percent') {
      if (input.slParam <= 0) throw new Error('Persentase SL wajib lebih besar dari 0.');
      const maxAllocation = Math.floor(input.autoAmount / (input.slParam / 100));
      let lots = Math.floor(maxAllocation / costPerLot);
      if (lots < 1) throw new Error('Batas risiko terlalu kecil. Nilainya belum cukup untuk membeli 1 lot pada persentase SL tersebut.');

      const actualLossForLots = (lotCount) => {
        const buy = buyCostAt(input.entryPrice, lotCount, buyFeeRate);
        const targetLoss = Math.round(buy.totalCost * input.slParam / 100);
        const sl = findSL(input.entryPrice, buy.shares, buy.totalCost, targetLoss, sellFeeRate, taxRate);
        return sl.netLoss;
      };

      while (lots > 0 && actualLossForLots(lots) > input.autoAmount) lots--;
      if (lots < 1) throw new Error('Batas risiko terlalu kecil setelah pembulatan fraksi harga dan fee. Minimal belum cukup untuk 1 lot.');

      return {
        lots,
        basis: `Position size dicari dari risiko maksimal ${fmtRp(input.autoAmount)}`,
        note: `Position size dibatasi agar risiko bersih setelah fraksi harga dan fee tidak melewati ${fmtRp(input.autoAmount)}.`
      };
    }

    const slPrice = priceFromSLMode(input);
    if (slPrice >= input.entryPrice) throw new Error('Harga SL untuk position sizing otomatis harus berada di bawah harga entry.');

    const lossForLots = (lotCount) => {
      const buy = buyCostAt(input.entryPrice, lotCount, buyFeeRate);
      const sell = sellAt(slPrice, buy.shares, sellFeeRate, taxRate);
      return buy.totalCost - sell.net;
    };

    const perLotLoss = lossForLots(1);
    if (perLotLoss <= 0) throw new Error('SL tidak menghasilkan risiko bersih yang valid.');
    const lots = Math.floor(input.autoAmount / perLotLoss);
    if (lots < 1) throw new Error('Batas risiko terlalu kecil. Nilainya belum cukup untuk membeli 1 lot pada jarak SL tersebut.');

    return {
      lots,
      basis: `Position size dicari dari risiko maksimal ${fmtRp(input.autoAmount)}`,
      note: `Position size dihitung dari entry ${fmtNum(input.entryPrice)} dan SL ${fmtNum(slPrice)} agar loss bersih tidak melewati ${fmtRp(input.autoAmount)}.`
    };
  }

  return null;
}

function calculateLotsAndAllocation(input, buyFeeRate, sellFeeRate, taxRate) {
  const forcedAutoMode = shouldAutoFromProfit(input) ? 'tp_profit' : null;
  const autoPlan = estimateAutoLots(input, buyFeeRate, sellFeeRate, taxRate, forcedAutoMode);
  if (autoPlan) {
    const buy = buyCostAt(input.entryPrice, autoPlan.lots, buyFeeRate);
    const allocation = buy.totalCost;
    if (input.totalCapital > 0 && allocation > input.totalCapital) {
      throw new Error(`Position sizing otomatis menghasilkan kebutuhan dana beli ${fmtRp(allocation)}, lebih besar dari dana trading tersedia ${fmtRp(input.totalCapital)}.`);
    }
    return { lots: autoPlan.lots, allocation, allocationBasis: autoPlan.basis, allocationNote: autoPlan.note, autoPlan };
  }

  if (input.manualLotMode) {
    const lots = Math.floor(input.manualLot);
    const buy = buyCostAt(input.entryPrice, lots, buyFeeRate);
    const allocation = input.allocation > 0 ? input.allocation : buy.totalCost;
    if (input.totalCapital > 0 && buy.totalCost > input.totalCapital) {
      throw new Error(`Kebutuhan dana beli ${fmtRp(buy.totalCost)} lebih besar dari dana trading tersedia ${fmtRp(input.totalCapital)}.`);
    }
    return {
      lots,
      allocation,
      allocationBasis: input.allocation > 0 ? 'Lot manual + plafon posisi manual' : 'Lot manual tanpa plafon posisi',
      allocationNote: input.allocation > 0 ? 'Lot mengikuti input manual, sisa plafon dihitung dari position size yang diisi.' : 'Position size otomatis disetarakan dengan kebutuhan dana beli karena plafon posisi kosong.',
      autoPlan: null
    };
  }

  if (input.allocation > 0) {
    const lots = Math.floor(input.allocation / (input.entryPrice * LOT_SIZE * (1 + buyFeeRate)));
    return { lots, allocation: input.allocation, allocationBasis: 'Plafon posisi manual', allocationNote: 'Lot dihitung dari plafon posisi seperti versi sebelumnya.', autoPlan: null };
  }

  throw new Error('Position size belum bisa dihitung. Isi plafon posisi, isi lot manual, atau isi Target Net Profit serta Jenis TP tick/harga/persentase untuk mencari kebutuhan dana beli.');
}

function calculateTP(input, shares, totalCost, allocation, sellFeeRate, taxRate) {
  if (input.tpMode === 'nominal') {
    const targetProfit = input.tpParam > 0 ? input.tpParam : input.targetProfit;
    if (targetProfit <= 0) throw new Error('Target Net Profit wajib diisi untuk TP berbasis Rupiah.');
    const tp = findTP(input.entryPrice, shares, totalCost, targetProfit, sellFeeRate, taxRate);
    return { ...tp, targetProfit, modeLabel: 'TP target net profit' };
  }

  if (input.tpMode === 'percent') {
    if (allocation <= 0) throw new Error('Position size wajib tersedia untuk TP persentase.');
    if (input.tpParam <= 0) throw new Error('Nilai TP persen wajib lebih besar dari 0.');
    const targetProfit = Math.round(allocation * input.tpParam / 100);
    const tp = findTP(input.entryPrice, shares, totalCost, targetProfit, sellFeeRate, taxRate);
    return { ...tp, targetProfit, modeLabel: `TP ${fmtPct(input.tpParam)} position size` };
  }

  if (input.tpMode === 'tick') {
    const price = priceFromTPMode(input);
    if (price <= input.entryPrice) throw new Error('Harga TP harus lebih tinggi dari entry.');
    const sell = sellAt(price, shares, sellFeeRate, taxRate);
    const netProfit = sell.net - totalCost;
    if (netProfit <= 0) throw new Error('Jarak TP tick terlalu dekat. Net profit masih nol atau negatif setelah fee.');
    return { ...sell, netProfit, targetProfit: netProfit, modeLabel: `TP ${Math.floor(input.tpParam)} tick` };
  }

  if (input.tpMode === 'price') {
    const price = priceFromTPMode(input);
    if (price <= input.entryPrice) throw new Error('Harga TP harus lebih tinggi dari entry.');
    const sell = sellAt(price, shares, sellFeeRate, taxRate);
    const netProfit = sell.net - totalCost;
    if (netProfit <= 0) throw new Error('Harga TP terlalu dekat. Net profit masih nol atau negatif setelah fee.');
    return { ...sell, netProfit, targetProfit: netProfit, modeLabel: `TP harga ${fmtNum(price)}` };
  }

  throw new Error('Mode TP tidak valid.');
}

function calculateSL(input, shares, totalCost, allocation, sellFeeRate, taxRate, tpResult) {
  if (input.slMode === 'rr') {
    if (input.rrRatio <= 0) throw new Error('Rasio reward terhadap risk harus lebih besar dari 0.');
    const targetLoss = tpResult.targetProfit / input.rrRatio;
    const sl = findSL(input.entryPrice, shares, totalCost, targetLoss, sellFeeRate, taxRate);
    return { ...sl, targetLoss, modeLabel: `SL risk-reward 1:${input.rrRatio.toLocaleString('id-ID', { maximumFractionDigits: 2 })}` };
  }

  if (input.slMode === 'nominal') {
    if (input.slParam <= 0) throw new Error('Nilai SL risiko nominal wajib lebih besar dari 0.');
    const targetLoss = input.slParam;
    const sl = findSL(input.entryPrice, shares, totalCost, targetLoss, sellFeeRate, taxRate);
    return { ...sl, targetLoss, modeLabel: `SL risiko nominal ${fmtRp(targetLoss)}` };
  }

  if (input.slMode === 'percent') {
    if (allocation <= 0) throw new Error('Position size wajib tersedia untuk SL persentase.');
    if (input.slParam <= 0) throw new Error('Nilai SL persen wajib lebih besar dari 0.');
    const targetLoss = Math.round(allocation * input.slParam / 100);
    const sl = findSL(input.entryPrice, shares, totalCost, targetLoss, sellFeeRate, taxRate);
    return { ...sl, targetLoss, modeLabel: `SL ${fmtPct(input.slParam)} position size` };
  }

  if (input.slMode === 'tick') {
    const price = priceFromSLMode(input);
    if (price >= input.entryPrice) throw new Error('Harga SL harus lebih rendah dari entry.');
    const sell = sellAt(price, shares, sellFeeRate, taxRate);
    const netLoss = totalCost - sell.net;
    if (netLoss <= 0) throw new Error('SL tick tidak menghasilkan loss bersih yang valid.');
    return { ...sell, netLoss, targetLoss: netLoss, modeLabel: `SL ${Math.floor(input.slParam)} tick` };
  }

  if (input.slMode === 'price') {
    const price = priceFromSLMode(input);
    if (price >= input.entryPrice) throw new Error('Harga SL harus lebih rendah dari entry.');
    const sell = sellAt(price, shares, sellFeeRate, taxRate);
    const netLoss = totalCost - sell.net;
    if (netLoss <= 0) throw new Error('Harga SL tidak menghasilkan loss bersih yang valid.');
    return { ...sell, netLoss, targetLoss: netLoss, modeLabel: `SL harga ${fmtNum(price)}` };
  }

  throw new Error('Mode SL tidak valid.');
}

function getAutoRejectBandPct(price) {
  const p = Number(price) || 0;
  if (p <= 200) return 35;
  if (p <= 5000) return 25;
  return 20;
}

function calculateAutoReject(input, tp, sl) {
  if (input.prevClose <= 0) return null;

  let araPct = getAutoRejectBandPct(input.prevClose);
  let arbPct = 15;
  let modeLabel = 'Reguler BEI: ARA bertingkat, ARB 15%';

  if (input.autoRejectMode === 'symmetric') {
    arbPct = araPct;
    modeLabel = 'Simetris bertingkat';
  }

  if (input.autoRejectMode === 'custom') {
    araPct = input.customAraPct;
    arbPct = input.customArbPct;
    modeLabel = 'Custom';
  }

  const araRaw = input.prevClose * (1 + araPct / 100);
  const arbRaw = input.prevClose * (1 - arbPct / 100);
  const araPrice = nearestValidDown(araRaw);
  const arbPrice = nearestValidUp(Math.max(1, arbRaw));
  const entryOk = input.entryPrice <= araPrice && input.entryPrice >= arbPrice;
  const tpOk = tp.price <= araPrice;
  const slOk = sl.price >= arbPrice;
  const tpRoomPct = ((araPrice - input.entryPrice) / input.entryPrice) * 100;
  const slRoomPct = ((input.entryPrice - arbPrice) / input.entryPrice) * 100;
  const tpToAraTicks = tpOk ? countTicksUp(tp.price, araPrice) : countTicksUp(araPrice, tp.price) * -1;
  const slToArbTicks = slOk ? countTicksDown(sl.price, arbPrice) : countTicksDown(arbPrice, sl.price) * -1;

  return { araPct, arbPct, modeLabel, araPrice, arbPrice, entryOk, tpOk, slOk, tpRoomPct, slRoomPct, tpToAraTicks, slToArbTicks };
}

function calculate() {
  const input = readInput();
  const errors = validate(input);
  if (errors.length) throw new Error(errors.join('\n'));

  const buyFeeRate = input.buyFeePct / 100;
  const sellFeeRate = input.sellFeePct / 100;
  const taxRate = input.taxFeePct / 100;

  const lotPlan = calculateLotsAndAllocation(input, buyFeeRate, sellFeeRate, taxRate);
  const lots = lotPlan.lots;
  if (lots < 1) throw new Error('Jumlah lot 0. Naikkan plafon posisi, turunkan harga entry, atau gunakan position sizing otomatis.');

  const { shares, grossBuy, buyFee, totalCost } = buyCostAt(input.entryPrice, lots, buyFeeRate);
  const allocation = lotPlan.allocation > 0 ? lotPlan.allocation : totalCost;

  if (input.totalCapital > 0 && totalCost > input.totalCapital) {
    throw new Error(`Kebutuhan dana beli ${fmtRp(totalCost)} lebih besar dari dana trading tersedia ${fmtRp(input.totalCapital)}.`);
  }

  if (input.allocationMode === 'manual' && input.allocation > 0 && totalCost > input.allocation) {
    throw new Error('Kebutuhan dana beli melebihi alokasi. Kurangi lot manual atau naikkan alokasi.');
  }

  const remainingAllocation = allocation - totalCost;
  const tp = calculateTP(input, shares, totalCost, allocation, sellFeeRate, taxRate);
  const sl = calculateSL(input, shares, totalCost, allocation, sellFeeRate, taxRate, tp);

  const tpTicks = countTicksUp(input.entryPrice, tp.price);
  const slTicks = countTicksDown(input.entryPrice, sl.price);
  const tpPct = ((tp.price - input.entryPrice) / input.entryPrice) * 100;
  const slPct = ((input.entryPrice - sl.price) / input.entryPrice) * 100;
  const entryTick = getTickSize(input.entryPrice);
  const slStatus = getSLStatus(slTicks);
  const autoReject = calculateAutoReject(input, tp, sl);

  return { ...input, buyFeeRate, sellFeeRate, taxRate, allocation, lots, shares, grossBuy, buyFee, totalCost, remainingAllocation, targetLoss: sl.targetLoss, tp, sl, tpTicks, slTicks, tpPct, slPct, entryTick, slStatus, allocationBasis: lotPlan.allocationBasis, allocationNote: lotPlan.allocationNote, autoReject };
}

function setText(id, value) {
  $(id).textContent = value;
}

function setMetricState(id, ok, warn = false) {
  const el = $(id);
  el.classList.remove('good', 'bad', 'warn');
  if (warn) el.classList.add('warn');
  else el.classList.add(ok ? 'good' : 'bad');
}

function renderAutoReject(result) {
  const ar = result.autoReject;
  if (!ar) {
    setText('insAra', '-');
    setText('insArb', '-');
    setText('insTPAra', '-');
    setText('insSLArb', '-');
    setText('araNote', 'Isi close kemarin untuk cek batas ARA/ARB harian.');
    $('insTPAra').classList.remove('good', 'bad', 'warn');
    $('insSLArb').classList.remove('good', 'bad', 'warn');
    return;
  }

  setText('insAra', `${fmtNum(ar.araPrice)} (${fmtPct(ar.araPct)})`);
  setText('insArb', `${fmtNum(ar.arbPrice)} (${fmtPct(ar.arbPct)})`);
  setText('insTPAra', ar.tpOk ? 'Masuk area' : 'Lewat ARA');
  setText('insSLArb', ar.slOk ? 'Masuk area' : 'Lewat ARB');
  setMetricState('insTPAra', ar.tpOk);
  setMetricState('insSLArb', ar.slOk);

  const entryText = ar.entryOk ? 'Entry masih berada dalam rentang ARA/ARB harian.' : 'Entry berada di luar rentang ARA/ARB berdasarkan harga penutupan hari sebelumnya.';
  const tpRoom = ar.tpToAraTicks >= 0 ? `sisa ${fmtNum(ar.tpToAraTicks)} tick ke ARA` : `melewati ARA ${fmtNum(Math.abs(ar.tpToAraTicks))} tick`;
  const slRoom = ar.slToArbTicks >= 0 ? `sisa ${fmtNum(ar.slToArbTicks)} tick ke ARB` : `melewati ARB ${fmtNum(Math.abs(ar.slToArbTicks))} tick`;
  setText(
    'araNote',
    `${entryText} Batas ${ar.modeLabel}. Dari entry, ruang ke ARA ${fmtPct(ar.tpRoomPct)}, ruang ke ARB ${fmtPct(ar.slRoomPct)}. TP ${tpRoom}; SL ${slRoom}.`
  );
}

function render(result) {
  lastResult = result;
  setText('resultSymbol', result.symbol ? `${result.symbol} · Hasil` : 'Hasil');
  setText('outLots', `${fmtNum(result.lots)} lot`);
  setText('outShares', fmtNum(result.shares));
  setText('outTotalCost', fmtRp(result.totalCost));
  setText('outRemain', fmtRp(result.remainingAllocation));
  setText('outAllocBasis', result.allocationBasis);
  setText('outModeInfo', `${result.tp.modeLabel} · ${result.sl.modeLabel}`);
  setText('outRR', result.slMode === 'rr' ? `R:R 1:${result.rrRatio.toLocaleString('id-ID', { maximumFractionDigits: 2 })}` : `TP/SL manual · risiko ${fmtRp(result.sl.targetLoss)}`);

  setText('outTP', `TP ${fmtNum(result.tp.price)}`);
  setText('outTPTicks', result.tpTicks);
  setText('outTPPct', fmtPct(result.tpPct));
  setText('outNetProfit', fmtRp(result.tp.netProfit));

  setText('outSL', `SL ${fmtNum(result.sl.price)}`);
  setText('outSLTicks', result.slTicks);
  setText('outSLPct', fmtPct(result.slPct));
  setText('outNetLoss', fmtRp(result.sl.netLoss));

  setText('costGrossBuy', fmtRp(result.grossBuy));
  setText('costBuyFee', `${fmtRp(result.buyFee)} (${fmtPct(result.buyFeePct)})`);
  setText('costTotalUsed', fmtRp(result.totalCost));
  setText('costGrossSellTP', fmtRp(result.tp.gross));
  setText('costSellFeeTP', `${fmtRp(result.tp.fee)} (${fmtPct(result.sellFeePct)})`);
  setText('costTaxTP', `${fmtRp(result.tp.estimatedTax)} (${fmtPct(result.taxFeePct)})`);
  setText('costProfit', fmtRp(result.tp.netProfit));
  setText('costGrossSellSL', fmtRp(result.sl.gross));
  setText('costSellFeeSL', `${fmtRp(result.sl.fee)} (${fmtPct(result.sellFeePct)})`);
  setText('costTaxSL', `${fmtRp(result.sl.estimatedTax)} (${fmtPct(result.taxFeePct)})`);
  setText('costLoss', fmtRp(result.sl.netLoss));

  setText('insTick', `Rp${fmtNum(result.entryTick)}`);
  setText('insTPDist', `${result.tpTicks} tick · ${fmtPct(result.tpPct)}`);
  setText('insSLDist', `${result.slTicks} tick · ${fmtPct(result.slPct)}`);
  setText('insStatus', result.slStatus);
  setText('chartTP', `TP ${fmtNum(result.tp.price)}`);
  setText('chartEntry', `Entry ${fmtNum(result.entryPrice)}`);
  setText('chartSL', `SL ${fmtNum(result.sl.price)}`);
  renderAutoReject(result);

  let warning = result.slTicks <= 3
    ? `Peringatan: SL hanya ${result.slTicks} tick dari entry. Jarak ini sangat dekat.`
    : `Net profit aktual ${fmtRp(result.tp.netProfit)}. Kualitas jarak SL: ${result.slStatus}.`;

  if (result.allocationNote) warning += ` ${result.allocationNote}`;
  if (result.autoReject && (!result.autoReject.tpOk || !result.autoReject.slOk || !result.autoReject.entryOk)) {
    warning += ' Periksa kembali TP/SL karena ada posisi yang keluar dari rentang ARA/ARB harian.';
  }
  setText('resultNote', warning);
}

function showError(message) {
  $('errorBox').textContent = message;
  $('errorBox').hidden = false;
}

function clearError() {
  $('errorBox').textContent = '';
  $('errorBox').hidden = true;
}

function showPage(name) {
  document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelectorAll('.navbtn').forEach((btn) => btn.classList.toggle('active', btn.dataset.target === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  $('symbol').value = '';
  $('totalCapital').value = '';
  $('allocation').value = '';
  $('entryPrice').value = '';
  $('targetProfit').value = '';
  $('buyFee').value = '0,15';
  $('sellFee').value = '0,25';
  $('taxFee').value = '0,10';
  $('manualLotToggle').checked = false;
  $('manualLot').value = '';
  $('manualLot').disabled = true;
  $('manualLotWrap').classList.add('disabled');
  $('rrRatio').value = '1';
  $('tpMode').value = 'nominal';
  $('tpParam').value = '';
  $('slMode').value = 'rr';
  $('slParam').value = '';
  $('allocationMode').value = 'manual';
  $('autoAmount').value = '';
  $('prevClose').value = '';
  $('autoRejectMode').value = 'regular2025';
  $('customAraPct').value = '25';
  $('customArbPct').value = '15';
  updateModeHelpers();
  clearError();
}

function copyResult() {
  if (!lastResult) return;
  const r = lastResult;
  const lines = [
    `Kalkulator Position Sizing Saham ${r.symbol ? '- ' + r.symbol : ''}`.trim(),
    `Entry: Rp${fmtNum(r.entryPrice)}`,
    `Lot: ${fmtNum(r.lots)} lot`,
    `TP: Rp${fmtNum(r.tp.price)} | ${r.tpTicks} tick | ${fmtPct(r.tpPct)} | Profit bersih ${fmtRp(r.tp.netProfit)} | ${r.tp.modeLabel}`,
    `SL: Rp${fmtNum(r.sl.price)} | ${r.slTicks} tick | ${fmtPct(r.slPct)} | Loss bersih ${fmtRp(r.sl.netLoss)} | ${r.sl.modeLabel}`,
    `Kebutuhan dana beli: ${fmtRp(r.totalCost)}`,
    `Sisa plafon posisi: ${fmtRp(r.remainingAllocation)}`,
    `Metode sizing: ${r.allocationBasis}`,
    `Kualitas jarak SL: ${r.slStatus}`
  ];

  if (r.autoReject) {
    lines.push(`ARA: ${fmtNum(r.autoReject.araPrice)} (${fmtPct(r.autoReject.araPct)}) | TP ${r.autoReject.tpOk ? 'masuk area' : 'lewat ARA'}`);
    lines.push(`ARB: ${fmtNum(r.autoReject.arbPrice)} (${fmtPct(r.autoReject.arbPct)}) | SL ${r.autoReject.slOk ? 'masuk area' : 'lewat ARB'}`);
  }

  navigator.clipboard?.writeText(lines.join('\n')).then(() => {
    $('copyBtn').textContent = 'Tersalin';
    setTimeout(() => $('copyBtn').textContent = 'Salin', 1300);
  });
}

function updateModeHelpers() {
  const tpMode = $('tpMode').value;
  const slMode = $('slMode').value;
  const tpUnits = { nominal: 'Rp', percent: '%', tick: 'tick', price: 'Rp' };
  const slUnits = { rr: 'R:R', nominal: 'Rp', percent: '%', tick: 'tick', price: 'Rp' };
  const tpPlaceholders = {
    nominal: 'Boleh kosong jika target net profit diisi',
    percent: '2,5',
    tick: '5',
    price: '2.500'
  };
  const slPlaceholders = {
    rr: 'Kosongkan jika memakai R:R',
    nominal: '1.000.000',
    percent: '1',
    tick: '3',
    price: '1.900'
  };

  $('tpUnit').textContent = tpUnits[tpMode] || '';
  $('slUnit').textContent = slUnits[slMode] || '';
  $('tpParam').placeholder = tpPlaceholders[tpMode] || '';
  $('slParam').placeholder = slPlaceholders[slMode] || '';
  $('tpParam').inputMode = tpMode === 'percent' ? 'decimal' : 'numeric';
  $('slParam').inputMode = slMode === 'percent' ? 'decimal' : 'numeric';

  const custom = $('autoRejectMode').value === 'custom';
  $('customAraPct').disabled = !custom;
  $('customArbPct').disabled = !custom;
  $('customAraPct').closest('.field').classList.toggle('disabled', !custom);
  $('customArbPct').closest('.field').classList.toggle('disabled', !custom);
}


function compareVersions(a, b) {
  const left = String(a || '0').split('.').map((part) => Number(part) || 0);
  const right = String(b || '0').split('.').map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

function setUpdateBanner(title, message, showReload) {
  const banner = $('updateBanner');
  if (!banner) return;
  $('updateTitle').textContent = title;
  $('updateMessage').textContent = message;
  $('reloadUpdateBtn').hidden = !showReload;
  banner.hidden = false;
}

function hideUpdateBannerSoon() {
  setTimeout(() => {
    const banner = $('updateBanner');
    if (banner && !updateWaiting) banner.hidden = true;
  }, 2600);
}

function markUpdateReady(versionText) {
  updateWaiting = true;
  setUpdateBanner(
    'Update tersedia',
    versionText ? `Versi ${versionText} sudah siap. Tekan Muat ulang untuk memakai versi baru.` : 'Versi baru sudah siap. Tekan Muat ulang untuk memakai versi baru.',
    true
  );
}

async function readLatestVersion() {
  const response = await fetch(`./version.json?ts=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (!response.ok) throw new Error('File versi tidak bisa dibaca.');
  return response.json();
}

async function checkForAppUpdate(manual = false) {
  if (!('serviceWorker' in navigator)) {
    setUpdateBanner('Update belum didukung', 'Browser ini belum mendukung update PWA melalui service worker.', false);
    return;
  }

  if (manual) setUpdateBanner('Mengecek update', 'Aplikasi sedang memeriksa versi terbaru dari server.', false);

  let latest = null;
  try {
    latest = await readLatestVersion();
    if (latest.version && compareVersions(latest.version, APP_VERSION) > 0) {
      setUpdateBanner('Update ditemukan', `Versi ${latest.version} tersedia. Menyiapkan file update dari server.`, false);
    }
  } catch (error) {
    if (manual) setUpdateBanner('Belum bisa cek versi', 'Pastikan aplikasi sedang online, lalu coba lagi.', false);
  }

  try {
    if (!swRegistration) swRegistration = await navigator.serviceWorker.ready;
    await swRegistration.update();

    if (swRegistration.waiting) {
      markUpdateReady(latest?.version || 'baru');
      return;
    }

    if (latest?.version && compareVersions(latest.version, APP_VERSION) > 0) {
      setUpdateBanner('Update sedang disiapkan', 'Tutup lalu buka aplikasi, atau tekan Update lagi beberapa detik setelah deploy selesai.', false);
      return;
    }

    if (manual) {
      setUpdateBanner('Sudah versi terbaru', `Aplikasi sudah memakai versi ${APP_VERSION}.`, false);
      hideUpdateBannerSoon();
    }
  } catch (error) {
    if (manual) setUpdateBanner('Gagal cek update', 'Koneksi atau service worker belum siap. Coba lagi setelah aplikasi terbuka penuh.', false);
  }
}

async function applyAppUpdate() {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (!swRegistration) swRegistration = await navigator.serviceWorker.ready;
    if (swRegistration.waiting) {
      isReloadingForUpdate = true;
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    await swRegistration.update();
    if (swRegistration.waiting) {
      isReloadingForUpdate = true;
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    window.location.reload();
  } catch (error) {
    window.location.reload();
  }
}

function bindEvents() {
  document.querySelectorAll('.money').forEach((input) => input.addEventListener('input', () => formatMoneyInput(input)));
  document.querySelectorAll('.percent').forEach((input) => input.addEventListener('input', () => normalizePercentInput(input)));
  document.querySelectorAll('.navbtn').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.target)));

  $('tpParam').addEventListener('input', () => formatModeInput($('tpParam'), $('tpMode').value));
  $('slParam').addEventListener('input', () => formatModeInput($('slParam'), $('slMode').value));
  $('tpMode').addEventListener('change', () => {
    $('tpParam').value = '';
    updateModeHelpers();
  });
  $('slMode').addEventListener('change', () => {
    $('slParam').value = '';
    updateModeHelpers();
  });
  $('autoRejectMode').addEventListener('change', updateModeHelpers);

  $('form').addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      const result = calculate();
      render(result);
      showPage('result');
    } catch (error) {
      showError(error.message);
      showPage('input');
    }
  });

  $('presetBtn').addEventListener('click', () => {
    $('buyFee').value = '0,15';
    $('sellFee').value = '0,25';
    $('taxFee').value = '0,10';
  });

  $('manualLotToggle').addEventListener('change', (event) => {
    const active = event.target.checked;
    $('manualLot').disabled = !active;
    $('manualLotWrap').classList.toggle('disabled', !active);
  });

  $('resetBtn').addEventListener('click', resetForm);
  $('copyBtn').addEventListener('click', copyResult);
  $('updateBtn').addEventListener('click', () => checkForAppUpdate(true));
  $('reloadUpdateBtn').addEventListener('click', applyAppUpdate);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    $('installBtn').hidden = false;
  });

  $('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    $('installBtn').hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  updateModeHelpers();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloadingForUpdate) {
      window.location.reload();
      return;
    }
    markUpdateReady();
  });

  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) markUpdateReady();
        });
      });
      checkForAppUpdate(false);
    } catch (error) {
      // Aplikasi tetap berjalan normal meskipun service worker gagal aktif.
    }
  });
}

bindEvents();
registerSW();
