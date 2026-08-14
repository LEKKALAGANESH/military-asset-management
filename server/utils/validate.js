import ApiError from './ApiError.js';

/**
 * Every value crossing the API boundary is cast to a primitive or rejected. This stops
 * type-confusion as much as typos: `{"username": {"$gt": ""}}` arrives as an object, and an
 * object compared or concatenated downstream is how injection bugs start.
 */

const isPresent = (value) => value !== undefined && value !== null && value !== '';

function rejectNonPrimitive(value, field) {
  if (typeof value === 'object' || typeof value === 'function') {
    throw ApiError.badRequest(`Invalid value for "${field}": expected a primitive value.`);
  }
}

export function asString(value, field, { required = true, min = 1, max = 255, pattern } = {}) {
  if (!isPresent(value)) {
    if (required) throw ApiError.badRequest(`"${field}" is required.`);
    return null;
  }
  rejectNonPrimitive(value, field);
  const text = String(value).trim();
  if (text.length < min) throw ApiError.badRequest(`"${field}" must be at least ${min} characters.`);
  if (text.length > max) throw ApiError.badRequest(`"${field}" must be at most ${max} characters.`);
  if (pattern && !pattern.test(text)) throw ApiError.badRequest(`"${field}" has an invalid format.`);
  return text;
}

export function asInt(value, field, { required = true, min = -2147483648, max = 2147483647 } = {}) {
  if (!isPresent(value)) {
    if (required) throw ApiError.badRequest(`"${field}" is required.`);
    return null;
  }
  rejectNonPrimitive(value, field);
  const number = Number(value);
  if (!Number.isInteger(number)) throw ApiError.badRequest(`"${field}" must be a whole number.`);
  if (number < min) throw ApiError.badRequest(`"${field}" must be at least ${min}.`);
  if (number > max) throw ApiError.badRequest(`"${field}" must be at most ${max}.`);
  return number;
}

export function asDecimal(value, field, { required = true, min = 0 } = {}) {
  if (!isPresent(value)) {
    if (required) throw ApiError.badRequest(`"${field}" is required.`);
    return null;
  }
  rejectNonPrimitive(value, field);
  const number = Number(value);
  if (!Number.isFinite(number)) throw ApiError.badRequest(`"${field}" must be a number.`);
  if (number < min) throw ApiError.badRequest(`"${field}" must be at least ${min}.`);
  return number;
}

export function asEnum(value, field, allowed, { required = true } = {}) {
  if (!isPresent(value)) {
    if (required) throw ApiError.badRequest(`"${field}" is required.`);
    return null;
  }
  rejectNonPrimitive(value, field);
  const text = String(value).trim().toUpperCase();
  if (!allowed.includes(text)) {
    throw ApiError.badRequest(`"${field}" must be one of: ${allowed.join(', ')}.`);
  }
  return text;
}

/** `endOfDay` widens a bare date to 23:59:59.999 so the last day is included. */
export function asDate(value, field, { required = true, endOfDay = false } = {}) {
  if (!isPresent(value)) {
    if (required) throw ApiError.badRequest(`"${field}" is required.`);
    return null;
  }
  rejectNonPrimitive(value, field);
  const text = String(value).trim();
  const date = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.999Z` : text);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`"${field}" must be a valid date.`);
  return date;
}

/** Capped so a caller cannot ask for the whole table. */
export function asPagination(queryParams) {
  return {
    limit: asInt(queryParams.limit ?? 50, 'limit', { min: 1, max: 200 }),
    offset: asInt(queryParams.offset ?? 0, 'offset', { min: 0, max: 1_000_000 }),
  };
}
