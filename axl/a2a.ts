// A2A (Agent-to-Agent) Protocol types
// Based on Google's A2A spec — task-based JSON-RPC 2.0 messaging between agents

export interface A2ATaskRequest {
  jsonrpc: "2.0";
  method: "tasks/send";
  id: string; // JSON-RPC request ID
  params: {
    id: string; // Task ID (same as message id)
    message: {
      role: "user";
      parts: [{ type: "data"; data: { to: string; subject: string; body: string } }];
    };
    metadata?: {
      fromAgent: string; // Node 1 public key
      timestamp: string;
    };
  };
}

export type A2ATaskState = "submitted" | "working" | "completed" | "failed";

export interface A2ATaskResponse {
  jsonrpc: "2.0";
  id: string; // Same JSON-RPC request ID
  result?: {
    id: string; // Same Task ID
    status: {
      state: A2ATaskState;
      message?: string;
    };
    artifacts?: Array<{
      parts: [{ type: "text"; text: string }];
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface A2AAgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: { tasks: Record<string, unknown> };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    inputModes: string[];
    outputModes: string[];
  }>;
}
