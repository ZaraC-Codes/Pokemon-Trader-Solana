/**
 * Format helpers for Hardhat tasks
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function header(text) {
  const line = '='.repeat(60);
  console.log();
  console.log(`${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}  ${text}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${line}${COLORS.reset}`);
  console.log();
}

function subheader(text) {
  console.log(`${COLORS.yellow}--- ${text} ---${COLORS.reset}`);
}

function success(text) {
  console.log(`${COLORS.green}✅ ${text}${COLORS.reset}`);
}

function warning(text) {
  console.log(`${COLORS.yellow}⚠️  ${text}${COLORS.reset}`);
}

function error(text) {
  console.log(`${COLORS.red}❌ ${text}${COLORS.reset}`);
}

function info(label, value) {
  console.log(`  ${COLORS.white}${label}:${COLORS.reset} ${COLORS.bright}${value}${COLORS.reset}`);
}

function danger(text) {
  console.log();
  console.log(`${COLORS.red}${'!'.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.red}${COLORS.bright}  ⚠️  DANGER: ${text}${COLORS.reset}`);
  console.log(`${COLORS.red}${'!'.repeat(60)}${COLORS.reset}`);
  console.log();
}

function formatAPE(value, decimals = 18) {
  const { ethers } = require('hardhat');
  return ethers.utils.formatUnits(value, decimals) + ' APE';
}

function formatUSDC(value, decimals = 6) {
  const { ethers } = require('hardhat');
  return '$' + ethers.utils.formatUnits(value, decimals) + ' USDC.e';
}

function healthStatus(apeAmount, threshold = '0.5') {
  const { ethers } = require('hardhat');
  const thresholdWei = ethers.utils.parseEther(threshold);
  if (apeAmount.gte(thresholdWei)) {
    return `${COLORS.green}✅ HEALTHY${COLORS.reset}`;
  } else {
    return `${COLORS.yellow}⚠️ LOW${COLORS.reset}`;
  }
}

function autoBuyStatus(usdcAmount, threshold = 51) {
  const { ethers } = require('hardhat');
  const thresholdUnits = ethers.utils.parseUnits(threshold.toString(), 6);
  if (usdcAmount.gte(thresholdUnits)) {
    return `${COLORS.green}✅ AUTO-BUY ELIGIBLE${COLORS.reset}`;
  } else {
    return `${COLORS.red}❌ AUTO-BUY BLOCKED${COLORS.reset}`;
  }
}

module.exports = {
  COLORS,
  header,
  subheader,
  success,
  warning,
  error,
  info,
  danger,
  formatAPE,
  formatUSDC,
  healthStatus,
  autoBuyStatus,
};
