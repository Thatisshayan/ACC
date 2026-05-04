// cloud/connectors/skills.js
// Skill map: ACC uses this to pick connectors + agents for a given intent.

const CONNECTOR_SKILLS = {
  notion: {
    capabilities: ["document", "knowledge", "sop", "spec", "notes"],
    actions:      ["readPage", "createPage", "updatePage", "queryDatabase"],
  },
  clickup: {
    capabilities: ["task", "project", "workflow", "assignment", "automation"],
    actions:      ["createTask", "updateTask", "addComment"],
  },
  linkedin: {
    capabilities: ["job_search", "profile_research", "company_research"],
    actions:      ["searchJobs", "searchProfiles"],
  },
  indeed: {
    capabilities: ["job_search"],
    actions:      ["searchJobs", "getJobDetails"],
  },
  browser: {
    capabilities: ["browse", "research", "scrape", "compare"],
    actions:      ["search", "visit", "chat"],
  },
  gmail: {
    capabilities: ["communication", "email"],
    actions:      ["sendEmail", "readEmails", "summarizeThread"],
  },
  stripe: {
    capabilities: ["payment", "billing"],
    actions:      ["createInvoice", "checkPayment", "generateReport"],
  },
  shopify: {
    capabilities: ["ecommerce", "inventory"],
    actions:      ["getProducts", "updateInventory", "syncOrders"],
  },
  deepseek: {
    capabilities: ["validate", "reasoning", "optimize"],
    actions:      ["validate", "reason", "optimize"],
  },
  claude: {
    capabilities: ["write", "plan", "summarize", "reason"],
    actions:      ["plan", "write", "summarize"],
  },
};

module.exports = { CONNECTOR_SKILLS };
