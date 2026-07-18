import { PrismaClient, UserRole, VersionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const exampleWorkflowDefinition = {
  initialStepKey: "fetch-account",
  steps: [
    {
      key: "fetch-account",
      name: "Fetch account profile",
      type: "API_CALL",
      handlerKey: "fetch-account-profile",
      next: { onSuccess: "route-score" },
      retry: { maxAttempts: 3, initialDelayMs: 10_000 },
    },
    {
      key: "route-score",
      name: "Route by risk score",
      type: "CONDITION",
      condition: {
        source: "context",
        path: "riskScore",
        operator: "gte",
        value: 70,
      },
      branches: [
        { match: true, nextStepKey: "manager-approval" },
        { match: false, nextStepKey: "generate-summary" },
      ],
    },
    {
      key: "manager-approval",
      name: "Manager approval",
      type: "APPROVAL",
      approvalRole: "APPROVER",
      next: {
        onApprove: "generate-summary",
        onReject: "notify-rejected",
      },
    },
    {
      key: "generate-summary",
      name: "Generate summary packet",
      type: "JOB",
      handlerKey: "generate-summary-packet",
      next: { onSuccess: "notify-finished" },
      retry: { maxAttempts: 4, initialDelayMs: 30_000 },
    },
    {
      key: "notify-rejected",
      name: "Notify request rejected",
      type: "API_CALL",
      handlerKey: "notify-rejected-webhook",
      next: { onSuccess: null },
      retry: { maxAttempts: 2, initialDelayMs: 60_000 },
    },
    {
      key: "notify-finished",
      name: "Notify finished",
      type: "API_CALL",
      handlerKey: "notify-finished-webhook",
      next: { onSuccess: null },
      retry: { maxAttempts: 2, initialDelayMs: 60_000 },
    },
  ],
};

async function upsertUser(email: string, name: string, role: UserRole) {
  const passwordHash = await bcrypt.hash("password123", 10);

  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  const admin = await upsertUser("admin@example.com", "Admin User", UserRole.ADMIN);
  await upsertUser("operator@example.com", "Operations User", UserRole.OPERATOR);
  await upsertUser("approver@example.com", "Approval User", UserRole.APPROVER);
  await upsertUser("viewer@example.com", "Viewer User", UserRole.VIEWER);

  const definition = await prisma.workflowDefinition.upsert({
    where: { key: "customer-risk-review" },
    update: {
      name: "Customer risk review",
      description: "Sample workflow that demonstrates API, condition, approval, and job steps.",
      status: "ACTIVE",
      latestVersionNumber: 1,
    },
    create: {
      key: "customer-risk-review",
      name: "Customer risk review",
      description: "Sample workflow that demonstrates API, condition, approval, and job steps.",
      status: "ACTIVE",
      latestVersionNumber: 1,
    },
  });

  await prisma.workflowVersion.upsert({
    where: {
      workflowDefinitionId_versionNumber: {
        workflowDefinitionId: definition.id,
        versionNumber: 1,
      },
    },
    update: {
      status: VersionStatus.ACTIVE,
      definition: exampleWorkflowDefinition,
      createdById: admin.id,
    },
    create: {
      workflowDefinitionId: definition.id,
      versionNumber: 1,
      status: VersionStatus.ACTIVE,
      definition: exampleWorkflowDefinition,
      createdById: admin.id,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
