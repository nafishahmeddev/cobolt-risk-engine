import { ReportType, ReportFrequency, RuleName } from "@app/database/primary";

//report freq map
export const REPORT_TYPE_TO_FREQUENCY: Record<ReportType, ReportFrequency> = {
    [ReportType.VELOCITY_SPIKE_DETECTION_REPORT]: ReportFrequency.DAILY,
    [ReportType.HIGH_FREQUENCY_TRANSACTION_ACTIVITY_REPORT]: ReportFrequency.DAILY,
    [ReportType.TRANSACTION_SIZE_DEVIATION_REPORT]: ReportFrequency.DAILY,
    [ReportType.SACTION_WALLET_EXPOSURE_REPORT]: ReportFrequency.DAILY,
    [ReportType.CROSS_BORDER_TRANSACTION_SURGE_REPORT]: ReportFrequency.DAILY,
    [ReportType.COORDINATED_WALLET_CLUSTER_ACTIVITY_REPORT]: ReportFrequency.DAILY,
    [ReportType.MARKET_EVENT_TRANSACTIN_MONITORING_REPORT]: ReportFrequency.DAILY,
}

//report to rulename map
export const REPORT_TYPE_TO_RULE_NAME: Record<ReportType, Array<RuleName>> = {
    [ReportType.VELOCITY_SPIKE_DETECTION_REPORT]: [RuleName.VELOCITY_SPIKE],
    [ReportType.HIGH_FREQUENCY_TRANSACTION_ACTIVITY_REPORT]: [RuleName.HIGH_FREQUENCY],
    [ReportType.TRANSACTION_SIZE_DEVIATION_REPORT]: [RuleName.SIZE_EXCEED],
    [ReportType.SACTION_WALLET_EXPOSURE_REPORT]: [RuleName.SANCTIONED_WALLET],
    [ReportType.CROSS_BORDER_TRANSACTION_SURGE_REPORT]: [RuleName.CROSS_BORDER_SURGE],
    [ReportType.COORDINATED_WALLET_CLUSTER_ACTIVITY_REPORT]: [RuleName.WALLET_CLUSTER],
    [ReportType.MARKET_EVENT_TRANSACTIN_MONITORING_REPORT]: [RuleName.MARKET_EVENT],
}

export function getReportTypesByFrequency(frequency: ReportFrequency): ReportType[] {
    return Object.entries(REPORT_TYPE_TO_FREQUENCY)
        .filter(([_, freq]) => freq === frequency)
        .map(([type]) => type as ReportType);
}

export function getRuleNamesByReportType(reportType: ReportType): RuleName[] {
    return REPORT_TYPE_TO_RULE_NAME[reportType];
}
