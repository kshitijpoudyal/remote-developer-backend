const GITHUB_API = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN env var is not set");
  return token;
}

async function ghFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json() as { message?: string };
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${body.message ?? "unknown error"}`);
  }
  return body;
}

export interface RepoFile {
  path: string;
  content: string;
}

export async function fetchFileContents(
  repo: string,
  branch: string | undefined,
  files: string[]
): Promise<RepoFile[]> {
  if (files.length === 0) return [];

  const results: RepoFile[] = [];
  for (const filePath of files) {
    const query = branch ? `?ref=${encodeURIComponent(branch)}` : "";
    const data = await ghFetch(`/repos/${repo}/contents/${filePath}${query}`) as {
      content?: string;
      encoding?: string;
    };

    if (data.content && data.encoding === "base64") {
      const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
      results.push({ path: filePath, content });
    }
  }
  return results;
}

export async function commitFiles(
  repo: string,
  branch: string,
  message: string,
  files: RepoFile[]
): Promise<{ commitUrl: string }> {
  // Step 1: get current HEAD SHA
  const refData = await ghFetch(`/repos/${repo}/git/ref/heads/${branch}`) as {
    object: { sha: string };
  };
  const headSha = refData.object.sha;

  // Step 2: get current tree SHA from commit
  const commitData = await ghFetch(`/repos/${repo}/git/commits/${headSha}`) as {
    tree: { sha: string };
  };
  const treeSha = commitData.tree.sha;

  // Step 3: create blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blob = await ghFetch(`/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        }),
      }) as { sha: string };

      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    })
  );

  // Step 4: create new tree
  const newTree = await ghFetch(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: treeSha, tree: treeItems }),
  }) as { sha: string };

  // Step 5: create commit
  const newCommit = await ghFetch(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [headSha],
    }),
  }) as { sha: string; html_url: string };

  // Step 6: update branch ref
  await ghFetch(`/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return { commitUrl: newCommit.html_url };
}

export async function createBranch(
  repo: string,
  newBranch: string,
  fromBranch: string
): Promise<void> {
  const refData = await ghFetch(`/repos/${repo}/git/ref/heads/${fromBranch}`) as {
    object: { sha: string };
  };
  await ghFetch(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${newBranch}`,
      sha: refData.object.sha,
    }),
  });
}

export async function createPullRequest(
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<{ prUrl: string }> {
  const pr = await ghFetch(`/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  }) as { html_url: string };

  return { prUrl: pr.html_url };
}

export async function getDefaultBranch(repo: string): Promise<string> {
  const data = await ghFetch(`/repos/${repo}`) as { default_branch: string };
  return data.default_branch;
}

const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf|zip|tar|gz|mp4|mp3|webm|bin|exe|dll)$/i;

export async function getRepoTree(repo: string, branch: string): Promise<string[]> {
  const data = await ghFetch(`/repos/${repo}/git/trees/${branch}?recursive=1`) as {
    tree: Array<{ path: string; type: string }>;
    truncated?: boolean;
  };
  return data.tree
    .filter((item) => item.type === "blob" && !BINARY_EXTENSIONS.test(item.path))
    .map((item) => item.path);
}
