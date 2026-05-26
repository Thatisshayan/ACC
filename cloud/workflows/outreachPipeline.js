'use strict';

const hunter = require('../integrations/hunter.js');
const resend = require('../integrations/resend.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

async function runPipeline(leads) {
  const results = [];

  for (const lead of leads) {
    const { name, company, domain, role, notes } = lead;
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    let emailFound = false;
    let emailAddress = null;
    let messageDrafted = false;
    let status = 'pending';

    try {
      const emailResult = await hunter.findEmail(domain, firstName, lastName);
      if (emailResult && emailResult.email) {
        emailFound = true;
        emailAddress = emailResult.email;

        const prompt = `Write a 3-sentence outreach email to ${name} at ${company} who is a ${role}. We are ACC v2, an AI orchestration platform. Be professional.`;

        const deepseekResponse = await axios.post(
          'https://api.deepseek.com/v1/chat/completions',
          {
            model: 'deepseek-chat',
            messages: [
              { role: 'user', content: prompt }
            ],
            max_tokens: 200
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const emailBody = deepseekResponse.data.choices[0].message.content;
        const subject = `Introduction: ACC v2 & ${name}`;

        await resend.sendTaskFromACC(emailAddress, subject, emailBody);
        messageDrafted = true;
        status = 'sent';
      } else {
        status = 'email_not_found';
      }
    } catch (err) {
      status = 'error';
      console.error(`Error processing lead ${name}:`, err.message);
    }

    results.push({
      lead,
      emailFound,
      emailAddress,
      messageDrafted,
      status
    });
  }

  const outputDir = path.join(__dirname, '..', 'data');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'outreach-results.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}

async function runSingleLead(lead) {
  return runPipeline([lead]);
}

module.exports = { runPipeline, runSingleLead };