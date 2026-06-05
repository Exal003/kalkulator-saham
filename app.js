'use strict';

const LOT_SIZE = 100;
const APP_VERSION = '1.1.0';
let lastResult = null;
let deferredPrompt = null;

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

function readInput() {
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
    manualLot: parseRupiah($('manualLot').value)
  };
}

function validate(input) {
  const errors = [];
  if (input.totalCapital <= 0) errors.push('Total modal wajib diisi.');
  if (input.allocation <= 0) errors.push('Alokasi per trade wajib diisi.');
  if (input.allocation > input.totalCapital) errors.push('Alokasi tidak boleh lebih besar dari total modal.');
  if (input.entryPrice <= 0) errors.push('Harga entry wajib diisi.');
  if (input.targetProfit <= 0) errors.push('Target profit bersih wajib diisi.');
  if (input.buyFeePct < 0 || input.sellFeePct < 0 || input.taxFeePct < 0) errors.push('Fee tidak boleh negatif.');
  if (input.rrRatio <= 0) errors.push('Reward per 1 risk harus lebih besar dari 0.');
  if (input.manualLotMode && input.manualLot <= 0) errors.push('Lot manual wajib diisi.');

  if (input.entryPrice > 0 && !isValidPrice(input.entryPrice)) {
    const down = nearestValidDown(input.entryPrice);
    const up = nearestValidUp(input.entryPrice);
    errors.push(`Harga entry belum sesuai fraksi BEI. Harga valid terdekat: ${fmtNum(down)} atau ${fmtNum(up)}.`);
  }

  return errors;
}

function calculate() {
  const input = readInput();
  const errors = validate(input);
  if (errors.length) throw new Error(errors.join('\n'));

  const buyFeeRate = input.buyFeePct / 100;
  const sellFeeRate = input.sellFeePct / 100;
  const taxRate = input.taxFeePct / 100;

  const lots = input.manualLotMode
    ? Math.floor(input.manualLot)
    : Math.floor(input.allocation / (input.entryPrice * LOT_SIZE * (1 + buyFeeRate)));

  if (lots < 1) throw new Error('Jumlah lot 0. Naikkan alokasi atau turunkan harga entry.');

  const shares = lots * LOT_SIZE;
  const grossBuy = Math.round(input.entryPrice * shares);
  const buyFee = Math.round(grossBuy * buyFeeRate);
  const totalCost = grossBuy + buyFee;

  if (totalCost > input.allocation) {
    throw new Error('Modal terpakai melebihi alokasi. Kurangi lot manual atau naikkan alokasi.');
  }

  const remainingAllocation = input.allocation - totalCost;
  const targetLoss = input.targetProfit / input.rrRatio;
  const tp = findTP(input.entryPrice, shares, totalCost, input.targetProfit, sellFeeRate, taxRate);
  const sl = findSL(input.entryPrice, shares, totalCost, targetLoss, sellFeeRate, taxRate);

  const tpTicks = countTicksUp(input.entryPrice, tp.price);
  const slTicks = countTicksDown(input.entryPrice, sl.price);
  const tpPct = ((tp.price - input.entryPrice) / input.entryPrice) * 100;
  const slPct = ((input.entryPrice - sl.price) / input.entryPrice) * 100;
  const entryTick = getTickSize(input.entryPrice);
  const slStatus = getSLStatus(slTicks);

  return { ...input, buyFeeRate, sellFeeRate, taxRate, lots, shares, grossBuy, buyFee, totalCost, remainingAllocation, targetLoss, tp, sl, tpTicks, slTicks, tpPct, slPct, entryTick, slStatus };
}

function setText(id, value) {
  $(id).textContent = value;
}

function render(result) {
  lastResult = result;
  setText('resultSymbol', result.symbol ? `${result.symbol} · Hasil` : 'Hasil');
  setText('outLots', `${fmtNum(result.lots)} lot`);
  setText('outShares', fmtNum(result.shares));
  setText('outTotalCost', fmtRp(result.totalCost));
  setText('outRemain', fmtRp(result.remainingAllocation));
  setText('outRR', `R:R 1:${result.rrRatio.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`);

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
  setText('insTPDist', `${result.tpTicks} tick`);
  setText('insSLDist', `${result.slTicks} tick`);
  setText('insStatus', result.slStatus);
  setText('chartTP', `TP ${fmtNum(result.tp.price)}`);
  setText('chartEntry', `Entry ${fmtNum(result.entryPrice)}`);
  setText('chartSL', `SL ${fmtNum(result.sl.price)}`);

  const warning = result.slTicks <= 3
    ? `Peringatan: SL hanya ${result.slTicks} tick dari entry. Jarak ini sangat dekat.`
    : `Target profit bersih minimal ${fmtRp(result.targetProfit)}. Status SL: ${result.slStatus}.`;
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
  clearError();
}

function copyResult() {
  if (!lastResult) return;
  const r = lastResult;
  const text = [
    `Kalkulator Saham ${r.symbol ? '- ' + r.symbol : ''}`.trim(),
    `Entry: Rp${fmtNum(r.entryPrice)}`,
    `Lot: ${fmtNum(r.lots)} lot`,
    `TP: Rp${fmtNum(r.tp.price)} | ${r.tpTicks} tick | ${fmtPct(r.tpPct)} | Profit bersih ${fmtRp(r.tp.netProfit)}`,
    `SL: Rp${fmtNum(r.sl.price)} | ${r.slTicks} tick | ${fmtPct(r.slPct)} | Loss bersih ${fmtRp(r.sl.netLoss)}`,
    `Modal terpakai: ${fmtRp(r.totalCost)}`,
    `Sisa alokasi: ${fmtRp(r.remainingAllocation)}`,
    `Status SL: ${r.slStatus}`
  ].join('\n');

  navigator.clipboard?.writeText(text).then(() => {
    $('copyBtn').textContent = 'Tersalin';
    setTimeout(() => $('copyBtn').textContent = 'Salin', 1300);
  });
}

function bindEvents() {
  document.querySelectorAll('.money').forEach((input) => input.addEventListener('input', () => formatMoneyInput(input)));
  document.querySelectorAll('.percent').forEach((input) => input.addEventListener('input', () => normalizePercentInput(input)));
  document.querySelectorAll('.navbtn').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.target)));

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
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

bindEvents();
registerSW();
