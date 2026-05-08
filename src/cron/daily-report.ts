
import { ILedger, Ledger, ReportFrequency, ReportType } from "@app/database/primary";
import { getReportTypesByFrequency, getRuleNamesByReportType } from "@app/services/report";
import { logger } from "@app/utils";
import dayjs from "dayjs";

async function generateReports() {
    //get all transactions from yesterday
    const startDate = dayjs().subtract(1, 'day').startOf('day');
    const endDate = dayjs().subtract(1, 'day').endOf('day');

    logger.info({ startDate: startDate.toDate(), endDate: endDate.toDate() }, "Generating reports for yesterday");


    const ledgerEntries = await Ledger.find({
        createdAt: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate(),
        }
    });

    const reportTypes = getReportTypesByFrequency(ReportFrequency.DAILY);
    const repotTypeLedgerMap: Record<ReportType, ILedger[]> = {} as Record<ReportType, ILedger[]>;
    for (const reportType of reportTypes) {
        const ruleNames = getRuleNamesByReportType(reportType);
        for (const ruleName of ruleNames) {
            const filteredLedgerEntries = ledgerEntries.filter((entry) => entry.triggeredRules.some((rule) => rule === ruleName));
            repotTypeLedgerMap[reportType] = filteredLedgerEntries;
        }
    }

    logger.info({ repotTypeLedgerMap }, "Repot Type Ledger Map");

    //TODO: generate reports
}


export async function tick(): Promise<void> {
    await generateReports()
}
