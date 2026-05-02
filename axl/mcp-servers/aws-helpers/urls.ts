// axl/mcp-servers/aws-helpers/urls.ts
//
// Hardcoded AWS console URLs the open_console / show_in_console tools navigate to.
// Replace these strings with the exact deep-links you want for your demo narrative —
// each URL becomes a separate approve-able MCP call.

export const AWS_REGION = "us-east-1";

export const AWS_URLS = {
  launchWizard: `https://console.aws.amazon.com/ec2/v2/home?region=${AWS_REGION}#LaunchInstanceWizard:`,
  instanceDetail: (instanceId: string) =>
    `https://console.aws.amazon.com/ec2/v2/home?region=${AWS_REGION}#InstanceDetails:instanceId=${instanceId}`,
};
