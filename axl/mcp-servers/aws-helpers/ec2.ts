// axl/mcp-servers/aws-helpers/ec2.ts
//
// Thin wrapper around @aws-sdk/client-ec2 for the demo's instance lifecycle.
// All defaults (AMI, type, region, keypair, security group) are hardcoded for
// the hackathon — swap by editing the constants below.

import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
} from "@aws-sdk/client-ec2";

export const AWS_REGION = "us-east-1";

// Amazon Linux 2023 x86_64 in us-east-1. Pinned for stability across demo runs.
// If AWS deprecates this AMI, look up the latest from the EC2 console.
export const AMI_ID = "ami-0c02fb55956c7d316";
export const INSTANCE_TYPE = "t2.micro";
export const KEY_NAME = "nanoclaw-key";
export const SG_NAME = "nanoclaw-demo-sg";

const client = new EC2Client({ region: AWS_REGION });

async function ensureSecurityGroup(): Promise<string> {
  try {
    const out = await client.send(new DescribeSecurityGroupsCommand({ GroupNames: [SG_NAME] }));
    const id = out.SecurityGroups?.[0]?.GroupId;
    if (id) return id;
  } catch {
    // Group doesn't exist — fall through to create.
  }

  const created = await client.send(new CreateSecurityGroupCommand({
    GroupName: SG_NAME,
    Description: "nanoclaw demo SSH access",
  }));
  if (!created.GroupId) throw new Error("CreateSecurityGroup returned no GroupId");

  await client.send(new AuthorizeSecurityGroupIngressCommand({
    GroupId: created.GroupId,
    IpPermissions: [{
      IpProtocol: "tcp",
      FromPort: 22,
      ToPort: 22,
      IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "SSH from anywhere (demo only)" }],
    }],
  }));

  return created.GroupId;
}

export interface LaunchedInstance {
  instance_id: string;
  public_ip: string;
}

export async function runInstance(name: string): Promise<LaunchedInstance> {
  const sgId = await ensureSecurityGroup();
  const out = await client.send(new RunInstancesCommand({
    ImageId: AMI_ID,
    InstanceType: INSTANCE_TYPE,
    KeyName: KEY_NAME,
    SecurityGroupIds: [sgId],
    MinCount: 1,
    MaxCount: 1,
    TagSpecifications: [{
      ResourceType: "instance",
      Tags: [{ Key: "Name", Value: name }],
    }],
  }));

  const instanceId = out.Instances?.[0]?.InstanceId;
  if (!instanceId) throw new Error("RunInstances returned no InstanceId");

  const ip = await waitForRunning(instanceId);
  return { instance_id: instanceId, public_ip: ip };
}

export async function waitForRunning(instanceId: string, timeoutS = 120): Promise<string> {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    const out = await client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    const inst = out.Reservations?.[0]?.Instances?.[0];
    if (inst?.State?.Name === "running" && inst.PublicIpAddress) {
      return inst.PublicIpAddress;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Instance ${instanceId} did not reach running state in ${timeoutS}s`);
}
