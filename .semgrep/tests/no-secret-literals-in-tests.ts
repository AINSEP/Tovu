// Deliberately short, invalid credentials: detector fixtures, never real tokens.
// ruleid: no-secret-literals-in-tests
const githubClassic = "ghp_FAKE";
// ruleid: no-secret-literals-in-tests
const githubFine = 'github_pat_FAKE';
// ruleid: no-secret-literals-in-tests
const openai = "sk-FAKE";
// ruleid: no-secret-literals-in-tests
const aws = "AKIAFAKE";
// ruleid: no-secret-literals-in-tests
const slackBot = "xoxb-FAKE";
// ruleid: no-secret-literals-in-tests
const slackUser = "xoxp-FAKE";
// ok: no-secret-literals-in-tests
const generated = ["ghp", "_", "FAKE"].join("");
// ok: no-secret-literals-in-tests
const generatedKey = ["sk", "-", "FAKE"].join("");
// ok: no-secret-literals-in-tests
const ordinary = "provider request failed";
// ok: no-secret-literals-in-tests
const fromEnvironment = process.env.TEST_API_KEY;
