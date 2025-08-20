'use strict';

const axios = require('axios');
const os = require('os');
const crypto = require('crypto');
const { getConfig, setConfig } = require('./config');

/**
 * Lightweight licensing helper
 * - Reads license from env LICENSE_KEY or config.licenseKey
 * - If LICENSE_VERIFY_URL is set, verifies remotely via POST { key, instanceId }
 * - Otherwise, any non-empty key is treated as valid
 */

function getInstanceId() {
  try {
    const hostname = os.hostname();
    const user = os.userInfo().username || 'user';
    const base = `${hostname}:${user}`;
    return crypto.createHash('sha1').update(base).digest('hex').slice(0, 16);
  } catch {
    return 'unknown-instance';
  }
}

function getLicenseKey() {
  // Prefer key saved in Settings (config) over env
  try {
    const cfg = getConfig();
    if (cfg && cfg.licenseKey && String(cfg.licenseKey).trim()) return String(cfg.licenseKey).trim();
  } catch {}
  const envKey = process.env.LICENSE_KEY;
  if (envKey && String(envKey).trim()) return String(envKey).trim();
  return '';
}

function getCachedLicenseStatus() {
  try {
    const cfg = getConfig();
    return {
      valid: cfg.licenseValid === true,
      validUntil: cfg.licenseValidUntil || null,
      verifiedAt: cfg.licenseVerifiedAt || null,
      keyPresent: !!getLicenseKey(),
      licenseVerifiedKeyHash: cfg.licenseVerifiedKeyHash || null,
    };
  } catch {
    return { valid: false, validUntil: null, verifiedAt: null, keyPresent: !!getLicenseKey(), licenseVerifiedKeyHash: null };
  }
}

async function verifyLicense({ save = true } = {}) {
  const key = getLicenseKey();
  const verifyUrl = process.env.LICENSE_VERIFY_URL || '';
  const nowIso = new Date().toISOString();
  const keyHash = key ? crypto.createHash('sha1').update(key).digest('hex') : null;

  // No key present
  if (!key) {
    if (save) setConfig({ licenseValid: false, licenseVerifiedAt: nowIso });
    return { valid: false, reason: 'missing', keyPresent: false };
  }

  // Remote verification required
  if (verifyUrl) {
    try {
      const instanceId = getInstanceId();
      const res = await axios.post(verifyUrl, { key, instanceId }, { timeout: 8000 });
      const body = res && res.data ? res.data : {};
      const valid = !!body.valid;
      const validUntil = body.validUntil || null;
      if (save) setConfig({ licenseValid: valid, licenseValidUntil: validUntil, licenseVerifiedAt: nowIso, licenseVerifiedKeyHash: keyHash });
      return { valid, validUntil, keyPresent: true };
    } catch (error) {
      // Network/verification failure → treat as invalid but keep going
      if (save) setConfig({ licenseValid: false, licenseVerifiedAt: nowIso, licenseVerifiedKeyHash: keyHash });
      return { valid: false, reason: 'verification_failed', error: error.message, keyPresent: true };
    }
  }
  // No verifier configured → never consider valid
  if (save) setConfig({ licenseValid: false, licenseVerifiedAt: nowIso, licenseVerifiedKeyHash: keyHash });
  return { valid: false, reason: 'no_verifier', keyPresent: true };
}

function isLicensed() {
  const status = getCachedLicenseStatus();
  if (!status.keyPresent) return false;
  // If verified key hash doesn't match current key, force invalid
  try {
    const currentKey = getLicenseKey();
    const currentHash = currentKey ? crypto.createHash('sha1').update(currentKey).digest('hex') : null;
    if (!status.verifiedAt || !status.valid || status.licenseVerifiedKeyHash !== currentHash) return false;
  } catch {}
  // If expired, treat as invalid
  if (status.validUntil) {
    try {
      if (new Date(status.validUntil) <= new Date()) return false;
    } catch {}
  }
  return true;
}

module.exports = {
  getLicenseKey,
  getCachedLicenseStatus,
  verifyLicense,
  isLicensed,
  getInstanceId,
};


