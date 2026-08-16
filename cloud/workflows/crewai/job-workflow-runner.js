// cloud/workflows/crewai/job-workflow-runner.js
// CommonJS module - CrewAI Job Application Workflow Runner
'use strict';

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const CREWAI_PROJECT_DIR = path.join(__dirname, 'intelligent_job_application_automation_v1_crewai-project');
const KNOWLEDGE_FILE = path.join(CREWAI_PROJECT_DIR, 'knowledge', 'user_preference.txt');
const USERS_STORE_PATH = path.join(__dirname, '..', '..', '..', 'data', 'users');

/**
 * Reads user profile from ACC users store
 * @param {string} userId - The user ID (e.g., 'shayan')
 * @returns {Object} User profile object
 */
function getUserProfile(userId) {
  const userFilePath = path.join(USERS_STORE_PATH, `${userId}.json`);
  if (!fs.existsSync(userFilePath)) {
    throw new Error(`User profile not found for ${userId}`);
  }
  return JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
}

/**
 * Updates the knowledge file with user's actual profile
 * @param {Object} userProfile - User profile data
 */
function updateKnowledgeFile(userProfile) {
  const knowledgeContent = `
User Profile:
Name: ${userProfile.name || 'Shayan'}
Email: ${userProfile.email || ''}
Phone: ${userProfile.phone || ''}
Location: ${userProfile.location || ''}
LinkedIn: ${userProfile.linkedin || ''}
GitHub: ${userProfile.github || ''}
Portfolio: ${userProfile.portfolio || ''}

Skills:
${(userProfile.skills || []).join(', ')}

Experience:
${(userProfile.experience || []).map(exp => `- ${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate || 'Present'}): ${exp.description}`).join('\n')}

Education:
${(userProfile.education || []).map(edu => `- ${edu.degree} in ${edu.field} from ${edu.institution} (${edu.startYear} - ${edu.endYear})`).join('\n')}

Certifications:
${(userProfile.certifications || []).join(', ')}

Languages:
${(userProfile.languages || []).join(', ')}

Preferences:
${userProfile.preferences || 'Looking for challenging roles in AI/ML and software engineering.'}
`;

  fs.writeFileSync(KNOWLEDGE_FILE, knowledgeContent.trim(), 'utf8');
  console.log(`Knowledge file updated at ${KNOWLEDGE_FILE}`);
}

/**
 * Checks if uv is available
 * @returns {boolean}
 */
function isUvAvailable() {
  try {
    execSync('uv --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Runs the CrewAI project
 * @param {string} searchQuery - Job search query
 * @param {string} resumeContent - Resume content (optional, will use user profile if not provided)
 * @returns {Object} Execution result
 */
async function runCrewAI(searchQuery, resumeContent) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CREWAI_PROJECT_DIR)) {
      reject({ success: false, error: `CrewAI project directory not found: ${CREWAI_PROJECT_DIR}` });
      return;
    }

    const env = {
      ...process.env,
      SEARCH_QUERY: searchQuery,
      RESUME_CONTENT: resumeContent || '',
      PYTHONUNBUFFERED: '1'
    };

    // Command is fixed (never built from user input) — searchQuery/resumeContent
    // are passed via env vars only, never interpolated into the shell string.
    const command = isUvAvailable() ? 'uv run crewai run' : 'python -m intelligent_job_application_automation.main';

    console.log(`Running CrewAI in ${CREWAI_PROJECT_DIR} with command: ${command}`);
    console.log(`Search query: ${searchQuery}`);

    exec(command, {
      cwd: CREWAI_PROJECT_DIR,
      env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 300000 // 5 minutes timeout
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Execution error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        reject({ success: false, error: error.message, stderr, stdout });
        return;
      }

      const output = stdout || '';
      const jobsFoundMatch = output.match(/Jobs found:\s*(\d+)/i);
      const appsPreparedMatch = output.match(/Applications prepared:\s*(\d+)/i);

      const result = {
        success: true,
        jobs_found: jobsFoundMatch ? parseInt(jobsFoundMatch[1], 10) : 0,
        applications_prepared: appsPreparedMatch ? parseInt(appsPreparedMatch[1], 10) : 0,
        output,
        stderr
      };

      console.log(`CrewAI execution completed. Jobs found: ${result.jobs_found}, Applications prepared: ${result.applications_prepared}`);
      resolve(result);
    });
  });
}

/**
 * Generates a resume string from user profile
 * @param {Object} profile - User profile
 * @returns {string} Formatted resume
 */
function generateResumeFromProfile(profile) {
  const sections = [];

  sections.push(`# ${profile.name || 'Shayan'}`);
  sections.push(`Email: ${profile.email || ''}`);
  sections.push(`Phone: ${profile.phone || ''}`);
  sections.push(`Location: ${profile.location || ''}`);
  sections.push('');

  if (profile.summary) {
    sections.push('## Professional Summary');
    sections.push(profile.summary);
    sections.push('');
  }

  if (Array.isArray(profile.skills) && profile.skills.length) {
    sections.push('## Skills');
    sections.push(profile.skills.join(', '));
    sections.push('');
  }

  if (Array.isArray(profile.experience) && profile.experience.length) {
    sections.push('## Experience');
    profile.experience.forEach(exp => {
      sections.push(`- ${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate || 'Present'}): ${exp.description}`);
    });
    sections.push('');
  }

  if (Array.isArray(profile.education) && profile.education.length) {
    sections.push('## Education');
    profile.education.forEach(edu => {
      sections.push(`- ${edu.degree} in ${edu.field} from ${edu.institution} (${edu.startYear} - ${edu.endYear})`);
    });
    sections.push('');
  }

  if (Array.isArray(profile.certifications) && profile.certifications.length) {
    sections.push('## Certifications');
    sections.push(profile.certifications.join(', '));
  }

  return sections.join('\n');
}

/**
 * Main workflow runner - orchestrates the entire job application process
 * @param {Object} params - Input parameters
 * @param {string} [params.userId] - User ID (default: 'shayan')
 * @param {string} params.searchQuery - Job search query
 * @param {string} [params.resumeContent] - Optional resume content override
 * @returns {Object} Workflow result
 */
async function runJobWorkflow(params) {
  const { userId = 'shayan', searchQuery, resumeContent } = params || {};

  if (!searchQuery) {
    throw new Error('searchQuery is required');
  }

  console.log(`Starting job workflow for user: ${userId}, query: ${searchQuery}`);

  try {
    const userProfile = getUserProfile(userId);
    updateKnowledgeFile(userProfile);

    const finalResumeContent = resumeContent || generateResumeFromProfile(userProfile);
    const result = await runCrewAI(searchQuery, finalResumeContent);

    return {
      success: result.success,
      jobs_found: result.jobs_found,
      applications_prepared: result.applications_prepared,
      output: result.output,
      user_id: userId,
      search_query: searchQuery,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error(`Workflow failed: ${message}`);
    return {
      success: false,
      jobs_found: 0,
      applications_prepared: 0,
      output: message,
      error: message,
      user_id: userId,
      search_query: searchQuery,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { runJobWorkflow };
