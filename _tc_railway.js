require('dotenv').config();
var axios = require('axios');
var TOKEN = process.env.RAILWAY_API_TOKEN;
var GQL = 'https://backboard.railway.app/graphql/v2';
var H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

async function gql(q, v) {
  var r = await axios.post(GQL, { query: q, variables: v||{} }, { headers: H, timeout: 20000 });
  if (r.data.errors) throw new Error(r.data.errors[0].message);
  return r.data.data;
}

async function run() {
  console.log('Token:', TOKEN ? TOKEN.slice(0,8)+'...' : 'MISSING');

  // 1. Get account info + existing projects
  var me = await gql('{ me { id email } }');
  console.log('Account:', me.me.email);

  // 2. Create new project for TapCash
  console.log('\nCreating TapCash project...');
  var proj = await gql(
    'mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id name } }',
    { input: { name: 'tapcash-mvp' } }
  );
  var projectId = proj.projectCreate.id;
  console.log('Project created:', proj.projectCreate.name, projectId);

  // 3. Get the default environment
  var envData = await gql(
    'query($id:String!){ project(id:$id){ environments{ edges{ node{ id name } } } } }',
    { id: projectId }
  );
  var env = envData.project.environments.edges[0].node;
  console.log('Environment:', env.name, env.id);

  // 4. Create a service from GitHub repo
  console.log('\nCreating service from GitHub...');
  var svc = await gql(
    'mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
    { input: {
      projectId: projectId,
      name: 'tapcash-web',
      source: { repo: 'Thatisshayan/Tapcash' }
    }}
  );
  var serviceId = svc.serviceCreate.id;
  console.log('Service created:', svc.serviceCreate.name, serviceId);

  // 5. Set all env vars (no values printed)
  console.log('\nSetting environment variables...');
  var vars = {
    PORT: '3000',
    NODE_ENV: 'REDACTED',
    NEXT_PUBLIC_APP_URL: 'https://tapcash-REDACTED.up.railway.app',
    LOOTABLY_SECRET_KEY: process.env.LOOTABLY_SECRET_KEY || '',
    LOOTABLY_API_KEY: process.env.LOOTABLY_API_KEY || '',
  };

  // Firebase vars from .env if set
  var fbVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ];
  fbVars.forEach(function(k) {
    if (process.env[k]) vars[k] = process.env[k];
  });

  var toSet = {};
  Object.keys(vars).forEach(function(k) { if (vars[k]) toSet[k] = vars[k]; });

  await gql(
    'mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }',
    { input: { projectId, environmentId: env.id, serviceId, variables: toSet } }
  );
  console.log('Set', Object.keys(toSet).length, 'vars (no values logged)');

  // 6. Deploy
  console.log('\nTriggering deploy...');
  try {
    await gql(
      'mutation($sid:String!,$eid:String!){ serviceInstanceRedeploy(serviceId:$sid,environmentId:$eid) }',
      { sid: serviceId, eid: env.id }
    );
    console.log('Deploying!');
  } catch(e) {
    console.log('Redeploy note:', e.message, '(may need first deploy via dashboard)');
  }

  console.log('\n=== TapCash Railway Project ===');
  console.log('Project ID:', projectId);
  console.log('Service ID:', serviceId);
  console.log('Env ID:', env.id);
  console.log('Repo: https://github.com/Thatisshayan/Tapcash');
  console.log('\nNext: Go to Railway dashboard to see build logs.');
  console.log('Add Firebase env vars in Railway Variables tab if not auto-set.');
}

run().catch(function(e){ console.log('ERROR:', e.message); process.exit(1); });
