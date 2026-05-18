'use strict';
// cloud/integrations/neo4j.js — Neo4j graph connector

var URI = process.env.NEO4J_URI;
var USER = process.env.NEO4J_USER;
var PASS = process.env.NEO4J_PASSWORD;

if (!URI) console.warn('[neo4j] NEO4J_URI not set — integration disabled');
if (!USER) console.warn('[neo4j] NEO4J_USER not set — integration disabled');
if (!PASS) console.warn('[neo4j] NEO4J_PASSWORD not set — integration disabled');

function enabled() {
  return !!(URI && USER && PASS);
}

function uriValid() {
  return /^(bolt|neo4j|neo4j\+s|bolt\+s):\/\//i.test(String(URI));
}

async function checkHealth() {
  if (!enabled()) return { status: 'disabled', note: 'NEO4J_URI, NEO4J_USER, or NEO4J_PASSWORD missing' };
  if (!uriValid()) return { status: 'error', error: 'NEO4J_URI format invalid' };
  return { status: 'configured', note: 'Credentials present; bolt session check requires neo4j-driver' };
}

module.exports = { checkHealth, enabled };
