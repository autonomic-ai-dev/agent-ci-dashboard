import { Octokit } from 'octokit';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function run() {
  try {
    const query = `
      query {
        repository(owner: "autonomic-ai-dev", name: "agent-body") {
          name
          refs(refPrefix: "refs/tags/", last: 1) {
            nodes {
              name
              target {
                oid
                ... on Commit {
                  checkSuites(first: 10) {
                    nodes {
                      status
                      conclusion
                      workflowRun {
                        workflow { name }
                      }
                    }
                  }
                }
                ... on Tag {
                  target {
                    oid
                    ... on Commit {
                      checkSuites(first: 10) {
                        nodes {
                          status
                          conclusion
                          workflowRun {
                            workflow { name }
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
