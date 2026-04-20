// Copilot abstraction — placeholder until GitHub Copilot API is available
export async function callCopilot(prompt: string): Promise<{ diff: string; summary: string }> {
  // TODO: Replace with real GitHub Copilot API call when available
  const diff = `--- a/placeholder.ts
+++ b/placeholder.ts
@@ -0,0 +1,3 @@
+// Copilot placeholder
+// Prompt: ${prompt}
+// Replace this block with real Copilot API integration`;

  return {
    diff,
    summary: `[Copilot placeholder] ${prompt.slice(0, 100)}`,
  };
}
