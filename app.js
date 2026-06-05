'use strict';

const LOT_SIZE = 100;
const APP_VERSION = '1.0.0';
let lastResult = null;
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

function onlyDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function parseRupiah(value) {
  const digits = onlyDigits(value);
  return digits ? Number(digits) : 0;
}

function parsePercent(value) {
  const normalized = String(value || '').replace(/%/g, '').replace(/\./g, '').replace(',', '.').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatRupiahNumber(value) {
  const number = Math.round(Number(value) || 0);
  return number.toLocaleString('id-ID');
}

function formatRupiah(value) {
  return `Rp${formatRupiahNumber(value)}`;
}

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${number.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatInputRupiah(input) {
  const digits = onlyDigits(input.value);
  input.value = digits ? Number(digits).toLocaleString('id-ID') : '';
}

function formatInputPlainNumber(input) {
  const digits = onlyDigits(input.value);
  input.value = digits ? Number(digits).toLocaleString('id-ID') : '';
}

function normalizePercentInput(input) {
  let value = String(input.value || '').replace(/[^0-9,\.]/g, '').replace('.', ',');
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
  const tick = getTickSize(p);
  return p % tick === 0;
}

function nextValidPrice(price) {
  for (let p = Math.floor(price) + 1; p <= price + 100; p++) {
    if (isValidPrice(p)) return p;
  }
  throw new Error('Harga berikutnya tidak ditemukan.');
}

function previousValidPrice(price) {
  for (let p = Math.ceil(price) - 1; p > 0 && p >= price - 100; p--) {
    if (isValidPrice(p)) return p;
  }
  throw new Error('Harga sebelumnya tidak ditemukan.');
}

function countTicksUp(entry, target) {
  let count = 0;
  let price = entry;
  let guard = 0;
  while (price < target && guard < 300000) {
    price = nextValidPrice(price);
    count += 1;
    guard += 1;
  }
  return price === target ? count : 0;
}

function countTicksDown(entry, target) {
  let count = 0;
  let price = entry;
  let guard = 0;
  while (price > target && guard < 300000) {
    price = previousValidPrice(price);
    count += 1;
    guard += 1;
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

function calculateSellAtPrice(price, shares, sellFeeRate, taxRate) {
  const gross = Math.round(price * shares);
  const fee = Math.round(gross * sellFeeRate);
  const estimatedTax = Math.round(gross * taxRate);
  const net = gross - fee;
  return { price, gross, fee, estimatedTax, net };
}

function findTP(entry, shares, totalCost, targetProfit, sellFeeRate, taxRate) {
  let price = entry;
  let guard = 0;
  while (guard < 300000) {
    price = nextValidPrice(price);
    const sell = calculateSellAtPrice(price, shares, sellFeeRate, taxRate);
    const netProfit = sell.net - totalCost;
    if (netProfit >= targetProfit) {
      return { ...sell, netProfit };
    }
    guard += 1;
  }
  throw new Error('TP tidak ditemukan. Target profit terlalu besar untuk simulasi ini.');
}

function findSL(entry, shares, totalCost, targetLoss, sellFeeRate, taxRate) {
  let price = entry;
  let guard = 0;
  while (guard < 300000) {
    price = previousValidPrice(price);
    if (price <= 0) break;
    const sell = calculateSellAtPrice(price, shares, sellFeeRate, taxRate);
    const netLoss = totalCost - sell.net;
    if (netLoss >= targetLoss) {
      return { ...sell, netLoss };
    }
    guard += 1;
  }
  throw new Error('SL tidak ditemukan. Target loss membuat harga SL mendekati nol.');
}

function validateInput(input) {
  const errors = [];
  if (input.totalCapital <= 0) errors.push('Total modal wajib diisi.');
  if (input.allocation <= 0) errors.push('Alokasi per trade wajib diisi.');
  if (input.allocation > input.totalCapital) errors.push('Alokasi modal tidak boleh lebih besar dari total modal.');
  if (input.entryPrice <= 0) errors.push('Harga entry wajib diisi.');
  if (!isValidPrice(input.entryPrice)) errors.push(`Harga entry belum sesuai fraksi harga BEI. Harga terdekat perlu mengikuti tick Rp${getTickSize(input.entryPrice)}.`);
  if (input.targetProfit <= 0) errors.push('Target profit bersih wajib diisi.');
  if (input.buyFeePct < 0 || input.sellFeePct < 0 || input.taxFeePct < 0) errors.push('Fee tidak boleh negatif.');
  if (input.rrRatio <= 0) errors.push('Reward per 1 risk harus lebih besar dari 0.');
  if (input.manualLotMode && input.manualLot <= 0) errors.push('Lot manual harus lebih besar dari 0.');
  return errors;
}

function calculate() {
  const input = {
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

  const errors = validateInput(input);
  if (errors.length) throw new Error(errors.join('\n'));

  const buyFeeRate = input.buyFeePct / 100;
  const sellFeeRate = input.sellFeePct / 100;
  const taxRate = input.taxFeePct / 100;

  let lots;
  if (input.manualLotMode) {
    lots = Math.floor(input.manualLot);
  } else {
    lots = Math.floor(input.allocation / (input.entryPrice * LOT_SIZE * (1 + buyFeeRate)));
  }

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

  return {
    ...input,
    buyFeeRate,
    sellFeeRate,
    taxRate,
    lots,
    shares,
    grossBuy,
    buyFee,
    totalCost,
    remainingAllocation,
    targetLoss,
    tp,
    sl,
    tpTicks,
    slTicks,
    tpPct,
    slPct,
    entryTick,
    slStatus
  };
}

function renderResult(result) {
  lastResult = result;

  $('resultSymbol').textContent = result.symbol ? `${result.symbol} · Simulasi` : 'Simulasi';
  $('outLots').textContent = `${formatRupiahNumber(result.lots)} lot`;
  $('outShares').textContent = formatRupiahNumber(result.shares);
  $('outTotalCost').textContent = formatRupiah(result.totalCost);
  $('outRemain').textContent = formatRupiah(result.remainingAllocation);
  $('outRR').textContent = `R:R 1:${result.rrRatio.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;

  $('outTP').textContent = `TP ${formatRupiahNumber(result.tp.price)}`;
  $('outTPTicks').textContent = result.tpTicks;
  $('outTPPct').textContent = formatPercent(result.tpPct);
  $('outNetProfit').textContent = formatRupiah(result.tp.netProfit);

  $('outSL').textContent = `SL ${formatRupiahNumber(result.sl.price)}`;
  $('outSLTicks').textContent = result.slTicks;
  $('outSLPct').textContent = formatPercent(result.slPct);
  $('outNetLoss').textContent = formatRupiah(result.sl.netLoss);

  $('resultNote').textContent = result.slTicks <= 3
    ? `Peringatan: SL hanya ${result.slTicks} tick dari entry. Jarak ini sangat dekat.`
    : `Target profit bersih minimal ${formatRupiah(result.targetProfit)}. SL berstatus ${result.slStatus}.`;

  $('costGrossBuy').textContent = formatRupiah(result.grossBuy);
  $('costBuyFee').textContent = `${formatRupiah(result.buyFee)} (${formatPercent(result.buyFeePct)})`;
  $('costTotalUsed').textContent = formatRupiah(result.totalCost);

  $('costGrossSellTP').textContent = formatRupiah(result.tp.gross);
  $('costSellFeeTP').textContent = `${formatRupiah(result.tp.fee)} (${formatPercent(result.sellFeePct)})`;
  $('costTaxTP').textContent = `${formatRupiah(result.tp.estimatedTax)} (${formatPercent(result.taxFeePct)})`;
  $('costProfit').textContent = formatRupiah(result.tp.netProfit);

  $('costGrossSellSL').textContent = formatRupiah(result.sl.gross);
  $('costSellFeeSL').textContent = `${formatRupiah(result.sl.fee)} (${formatPercent(result.sellFeePct)})`;
  $('costTaxSL').textContent = `${formatRupiah(result.sl.estimatedTax)} (${formatPercent(result.taxFeePct)})`;
  $('costLoss').textContent = formatRupiah(result.sl.netLoss);

  $('insTick').textContent = `Rp${formatRupiahNumber(result.entryTick)}`;
  $('insTPDist').textContent = `${result.tpTicks} tick`;
  $('insSLDist').textContent = `${result.slTicks} tick`;
  $('insStatus').textContent = result.slStatus;

  $('chartRange').textContent = `${formatRupiahNumber(result.sl.price)} - ${formatRupiahNumber(result.tp.price)}`;
  $('chartTP').textContent = `TP ${formatRupiahNumber(result.tp.price)}`;
  $('chartEntry').textContent = `Entry ${formatRupiahNumber(result.entryPrice)}`;
  $('chartSL').textContent = `SL ${formatRupiahNumber(result.sl.price)}`;
}

function showError(message) {
  const box = $('errorBox');
  box.textContent = message;
  box.hidden = false;
}

function clearError() {
  const box = $('errorBox');
  box.textContent = '';
  box.hidden = true;
}

function showPage(name) {
  document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetDefaults() {
  $('symbol').value = '';
  $('totalCapital').value = '100.000.000';
  $('allocation').value = '20.000.000';
  $('entryPrice').value = '1.030';
  $('targetProfit').value = '2.000.000';
  $('buyFee').value = '0,15';
  $('sellFee').value = '0,25';
  $('taxFee').value = '0,10';
  $('manualLotToggle').checked = false;
  $('manualLot').value = '193';
  $('manualLot').disabled = true;
  $('manualLotWrap').classList.add('muted');
  $('rrRatio').value = '1';
  clearError();
}

function copyResult() {
  if (!lastResult) return;
  const r = lastResult;
  const text = [
    `Kalkulator Saham ${r.symbol ? `- ${r.symbol}` : ''}`.trim(),
    `Entry: Rp${formatRupiahNumber(r.entryPrice)}`,
    `Lot: ${formatRupiahNumber(r.lots)} lot`,
    `TP: Rp${formatRupiahNumber(r.tp.price)} | ${r.tpTicks} tick | ${formatPercent(r.tpPct)} | Profit bersih ${formatRupiah(r.tp.netProfit)}`,
    `SL: Rp${formatRupiahNumber(r.sl.price)} | ${r.slTicks} tick | ${formatPercent(r.slPct)} | Loss bersih ${formatRupiah(r.sl.netLoss)}`,
    `Modal terpakai: ${formatRupiah(r.totalCost)}`,
    `Sisa alokasi: ${formatRupiah(r.remainingAllocation)}`,
    `Status SL: ${r.slStatus}`
  ].join('\n');
  navigator.clipboard?.writeText(text).then(() => {
    $('copyBtn').textContent = 'Tersalin';
    setTimeout(() => $('copyBtn').textContent = 'Salin', 1300);
  });
}

function bindEvents() {
  document.querySelectorAll('.rupiah-input').forEach((input) => {
    input.addEventListener('input', () => formatInputRupiah(input));
  });

  document.querySelectorAll('.percent-input').forEach((input) => {
    input.addEventListener('input', () => normalizePercentInput(input));
  });

  document.querySelectorAll('.plain-number').forEach((input) => {
    input.addEventListener('input', () => formatInputPlainNumber(input));
  });

  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => showPage(button.dataset.target));
  });

  $('calculatorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      const result = calculate();
      renderResult(result);
      showPage('result');
    } catch (error) {
      showError(error.message);
      showPage('input');
    }
  });

  $('stockbitPreset').addEventListener('click', () => {
    $('buyFee').value = '0,15';
    $('sellFee').value = '0,25';
    $('taxFee').value = '0,10';
  });

  $('manualLotToggle').addEventListener('change', (event) => {
    const active = event.target.checked;
    $('manualLot').disabled = !active;
    $('manualLotWrap').classList.toggle('muted', !active);
  });

  $('resetBtn').addEventListener('click', resetDefaults);
  $('copyBtn').addEventListener('click', copyResult);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const btn = $('installBtn');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      btn.hidden = true;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }, { once: true });
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

function init() {
  bindEvents();
  registerServiceWorker();
  try {
    const result = calculate();
    renderResult(result);
  } catch (_) {}
}

init();
