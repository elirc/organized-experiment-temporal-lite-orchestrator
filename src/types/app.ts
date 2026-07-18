export type AppSessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "APPROVER" | "VIEWER";
};

export type WorkflowListItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  updatedAt: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: string;
    createdAt: string;
  }>;
};

export type WorkflowRunListItem = {
  id: string;
  displayName: string | null;
  status: string;
  currentStepKey: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  workflowVersion: {
    id: string;
    versionNumber: number;
    workflowDefinition: {
      id: string;
      name: string;
      key: string;
    };
  };
  startedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  approvals: Array<{
    id: string;
    status: string;
  }>;
};

export type WorkflowRunDetail = WorkflowRunListItem & {
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  output: Record<string, unknown> | null;
  steps: Array<{
    id: string;
    stepKey: string;
    stepName: string;
    stepType: string;
    status: string;
    attemptCount: number;
    maxAttempts: number;
    backoffMs: number;
    lastError: string | null;
    availableAt: string | null;
    createdAt: string;
    completedAt: string | null;
    output: Record<string, unknown> | null;
    task: {
      id: string;
      queue: string;
      handlerKey: string;
      status: string;
      attemptCount: number;
      leaseOwner: string | null;
      availableAt: string;
    } | null;
    approval: {
      id: string;
      requiredRole: string;
      status: string;
      requestedAt: string;
      decisions: Array<{
        id: string;
        decision: string;
        comment: string | null;
        createdAt: string;
        actorUser: {
          id: string;
          name: string;
          role: string;
        };
      }>;
    } | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    message: string;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
    payload: Record<string, unknown> | null;
  }>;
};

export type ApprovalListItem = {
  id: string;
  requiredRole: string;
  status: string;
  requestedAt: string;
  workflowRun: {
    id: string;
    displayName: string | null;
    startedBy: {
      id: string;
      name: string;
      role: string;
    };
    workflowVersion: {
      workflowDefinition: {
        name: string;
        key: string;
      };
    };
  };
  stepRun: {
    id: string;
    stepKey: string;
    stepName: string;
  };
};
