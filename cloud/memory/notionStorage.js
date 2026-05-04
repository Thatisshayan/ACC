// cloud/memory/notionStorage.js
// Loads and saves ACC long-term memory to/from a Notion page.

const { getConnector } = require("../connectors/registry.js");

/**
 * loadFromNotion
 * Reads LTM JSON from a Notion page property called "memoryData".
 * Returns {} if connector not loaded or page not found.
 */
async function loadFromNotion() {
  const notion = getConnector("notion");
  if (!notion) return {};

  const pageId = process.env.NOTION_MEMORY_PAGE_ID || "REPLACE_NOTION_MEMORY_PAGE_ID";
  const res    = await notion.run("readPage", { pageId });
  if (!res.success) return {};

  try {
    const raw = res.output?.properties?.memoryData?.rich_text?.[0]?.text?.content;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * saveToNotion
 * Writes LTM JSON into a Notion page property called "memoryData".
 */
async function saveToNotion(data) {
  const notion = getConnector("notion");
  if (!notion) return { success: false, error: "Notion connector not loaded." };

  const pageId = process.env.NOTION_MEMORY_PAGE_ID || "REPLACE_NOTION_MEMORY_PAGE_ID";
  return await notion.run("updatePage", {
    pageId,
    data: {
      properties: {
        memoryData: {
          rich_text: [{ text: { content: JSON.stringify(data) } }],
        },
      },
    },
  });
}

module.exports = { loadFromNotion, saveToNotion };
