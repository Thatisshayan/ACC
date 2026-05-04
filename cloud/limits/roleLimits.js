// cloud/limits/roleLimits.js

const ROLE_LIMITS = {
  admin: {
    maxTextTasksPerHour:     Infinity,
    maxMediaTasksPerHour:    Infinity,
    maxConcurrentGraphs:     Infinity,
    maxVideoDuration:        300, // seconds
    maxRetries:              5,
    maxBrowserTasksPerHour:  Infinity,
    maxDeepseekTasksPerHour: Infinity,
  },
  power: {
    maxTextTasksPerHour:     200,
    maxMediaTasksPerHour:    50,
    maxConcurrentGraphs:     10,
    maxVideoDuration:        120,
    maxRetries:              3,
    maxBrowserTasksPerHour:  100,
    maxDeepseekTasksPerHour: 200,
  },
  normal: {
    maxTextTasksPerHour:     50,
    maxMediaTasksPerHour:    10,
    maxConcurrentGraphs:     3,
    maxVideoDuration:        60,
    maxRetries:              2,
    maxBrowserTasksPerHour:  20,
    maxDeepseekTasksPerHour: 50,
  },
  guest: {
    maxTextTasksPerHour:     10,
    maxMediaTasksPerHour:    2,
    maxConcurrentGraphs:     1,
    maxVideoDuration:        15,
    maxRetries:              1,
    maxBrowserTasksPerHour:  5,
    maxDeepseekTasksPerHour: 10,
  },
  banned: {
    maxTextTasksPerHour:     0,
    maxMediaTasksPerHour:    0,
    maxConcurrentGraphs:     0,
    maxVideoDuration:        0,
    maxRetries:              0,
    maxBrowserTasksPerHour:  0,
    maxDeepseekTasksPerHour: 0,
  },
};

/**
 * getLimits
 * @param {string} role
 * @returns {Object} limits for that role (defaults to guest if unknown)
 */
function getLimits(role) {
  return ROLE_LIMITS[role] || ROLE_LIMITS.guest;
}

module.exports = { ROLE_LIMITS, getLimits };
