// cloud/storage/supabase.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("[supabase] Warning: Missing Supabase environment variables.");
}

// Lazy init — client only created when env vars are present
function getClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * saveMediaRecord
 * @param {Object} data
 * @param {string} data.type     - "video" | "audio" | "image"
 * @param {string} data.engine   - "runway" | "pika" | "luma" | "dalle" | "elevenlabs" etc.
 * @param {string} data.r2Key
 * @param {string} data.publicUrl
 * @param {Object} data.meta
 */
async function saveMediaRecord(data = {}) {
  const { type, engine, r2Key, publicUrl, meta = {} } = data;

  if (!type || !engine || !r2Key) {
    return { success: false, error: "Supabase: missing required fields (type, engine, r2Key)." };
  }

  const supabase = getClient();
  if (!supabase) return { success: false, error: "Supabase: credentials not configured." };

  try {
    const { data: record, error } = await supabase
      .from("media")
      .insert({ type, engine, r2_key: r2Key, public_url: publicUrl, meta })
      .select()
      .single();

    if (error) throw error;
    return { success: true, record };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * getMediaRecord
 * @param {string} id
 */
async function getMediaRecord(id) {
  if (!id) return { success: false, error: "Supabase: missing id." };

  const supabase = getClient();
  if (!supabase) return { success: false, error: "Supabase: credentials not configured." };

  try {
    const { data: record, error } = await supabase
      .from("media")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return { success: true, record };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { saveMediaRecord, getMediaRecord };
