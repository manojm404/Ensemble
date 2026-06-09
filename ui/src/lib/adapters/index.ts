export * from "./types";

import * as mock from "./mock";
import * as real from "./real";

const useMock = import.meta.env.VITE_DATA_MODE === "mock";

export const dashboardApi = useMock ? mock.dashboardApi : real.dashboardApi;
export const workflowApi = useMock ? mock.workflowApi : real.workflowApi;
export const companyApi = useMock ? mock.companyApi : real.companyApi;
export const agentApi = useMock ? mock.agentApi : real.agentApi;
export const approvalApi = useMock ? mock.approvalApi : real.approvalApi;
export const marketplaceApi = useMock ? mock.marketplaceApi : real.marketplaceApi;
export const auditApi = useMock ? mock.auditApi : real.auditApi;
export const chatApi = useMock ? mock.chatApi : real.chatApi;
export const settingsApi = useMock ? mock.settingsApi : real.settingsApi;
