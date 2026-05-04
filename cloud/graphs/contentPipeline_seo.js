// cloud/graphs/contentPipeline_seo.js
// SEO content pipeline: plan → script → TTS → video build → upload prep → log

async function buildContentPipelineGraph({ text, language = "en", userId, role }) {
  return [
    {
      id: "PLAN", agentType: "architect",
      payload: { prompt: `Create a content plan for: ${text}. Include target keywords, title variants, and description.`, language },
      dependsOn: [], meta: { userId, role },
    },
    {
      id: "SCRIPT", agentType: "writer",
      payload: { prompt: "Write a video script optimized for SEO using the PLAN. Include timestamps and suggested visuals.", language },
      dependsOn: ["PLAN"], meta: { userId, role },
    },
    {
      id: "TTS", agentType: "elevenlabs",
      payload: { text: "SCRIPT_OUTPUT_PLACEHOLDER", voice: "Rachel", model: "eleven_multilingual_v2" },
      dependsOn: ["SCRIPT"], meta: { userId, role },
    },
    {
      id: "VIDEO_BUILD", agentType: "engineer",
      payload: { prompt: "Assemble a video manifest using SCRIPT and TTS output. Provide frame list, captions, and asset list in JSON.", language },
      dependsOn: ["TTS"], meta: { userId, role },
    },
    {
      id: "UPLOAD", agentType: "writer",
      payload: { prompt: "Prepare YouTube upload metadata: title, description, tags, timestamps, thumbnail suggestions. Output as JSON.", language },
      dependsOn: ["VIDEO_BUILD"], meta: { userId, role },
    },
    {
      id: "SEO_VALIDATE", agentType: "deepseek",
      payload: { mode: "validate", prompt: "Validate all SEO metadata for brand safety, keyword density, and platform compliance.", language },
      dependsOn: ["UPLOAD"], meta: { userId, role },
    },
    {
      id: "LOG", agentType: "clickup",
      payload: { action: "createTask", listId: process.env.CLICKUP_JOB_LIST_ID || "REPLACE_CLICKUP_JOB_LIST", data: { name: `SEO content: ${text.slice(0, 60)}`, description: "SEO content pipeline executed by ACC." } },
      dependsOn: ["SEO_VALIDATE"], meta: { userId, role },
    },
  ];
}

module.exports = { buildContentPipelineGraph };
