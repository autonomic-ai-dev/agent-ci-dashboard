import { Octokit } from 'octokit';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function run() {
  try {
    const query = `
      query {
        repository(owner: "autonomic-ai-dev", name: "agent-body") {
          refs(refPrefix: "refs/tags/", last: 1) {
            nodes {
              target {
                ... on Tag {
                  target {
                    ... on Commit {
                      checkSuites(first: 1) {
                        nodes {
                          workflowRun {
                            databaseId
                            workflow { databaseId }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const res = await octokit.graphql(query);
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
run();
