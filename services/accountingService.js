const Invoice = require("../models/Invoice");
const Waste = require("../models/Waste");
const SalesRecord = require("../models/SalesRecord");

class AccountingService {
  static getCurrentMonth() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  static round(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Get Monthly Financial Overview & P&L Summary
   */
  static async getMonthlySummary(monthQuery) {
    const isAll = (monthQuery === "all" || monthQuery === "");
    const month = isAll ? "all" : (monthQuery || this.getCurrentMonth());
    const filter = isAll ? {} : { month };

    const [invoices, wasteList, salesList] = await Promise.all([
      Invoice.find(filter).lean(),
      Waste.find(filter).lean(),
      SalesRecord.find(filter).lean()
    ]);

    // 1. Calculate Invoices
    let totalInvoices = 0;
    const categoryMap = {};
    for (const inv of invoices) {
      const amt = Number(inv.amount) || 0;
      totalInvoices += amt;
      const cat = inv.category || "أخرى";
      categoryMap[cat] = (categoryMap[cat] || 0) + amt;
    }

    // 2. Calculate Waste
    let totalWaste = 0;
    const wasteReasonMap = {};
    for (const wst of wasteList) {
      const loss = Number(wst.lossValue) || 0;
      totalWaste += loss;
      const r = wst.reason || "تلف عام";
      wasteReasonMap[r] = (wasteReasonMap[r] || 0) + loss;
    }

    // 3. Calculate Sales
    let totalSales = 0;
    let totalCash = 0;
    let totalVisa = 0;
    let totalOnline = 0;
    let totalOrdersCount = 0;

    for (const s of salesList) {
      const tot = Number(s.totalAmount) || 0;
      totalSales += tot;
      totalCash += Number(s.cashAmount) || 0;
      totalVisa += Number(s.visaAmount) || 0;
      totalOnline += Number(s.onlineAmount) || 0;
      totalOrdersCount += Number(s.ordersCount) || 0;
    }

    // 4. Key Metrics
    totalInvoices = this.round(totalInvoices);
    totalWaste = this.round(totalWaste);
    totalSales = this.round(totalSales);
    const netProfit = this.round(totalSales - (totalInvoices + totalWaste));
    const wasteRatio = totalInvoices > 0 ? this.round((totalWaste / totalInvoices) * 100) : 0;

    return {
      month,
      metrics: {
        totalInvoices,
        invoicesCount: invoices.length,
        totalWaste,
        wasteCount: wasteList.length,
        totalSales,
        salesRecordsCount: salesList.length,
        netProfit,
        wasteRatio, // percentage
        totalOrdersCount
      },
      salesBreakdown: {
        cash: this.round(totalCash),
        visa: this.round(totalVisa),
        online: this.round(totalOnline)
      },
      invoicesByCategory: Object.entries(categoryMap).map(([category, amount]) => ({
        category,
        amount: this.round(amount),
        percentage: totalInvoices > 0 ? this.round((amount / totalInvoices) * 100) : 0
      })),
      wasteByReason: Object.entries(wasteReasonMap).map(([reason, amount]) => ({
        reason,
        amount: this.round(amount),
        percentage: totalWaste > 0 ? this.round((amount / totalWaste) * 100) : 0
      })),
      recentInvoices: invoices.slice(-10).reverse(),
      recentWaste: wasteList.slice(-10).reverse(),
      recentSales: salesList.slice(-10).reverse()
    };
  }

  // ================= Invoices =================
  static async getInvoices(filter = {}) {
    const query = {};
    if (filter.month && filter.month !== "all") query.month = filter.month;
    if (filter.category && filter.category !== "all") query.category = filter.category;
    return await Invoice.find(query).sort({ invoiceDate: -1, createdAt: -1 }).lean();
  }

  static async createInvoice(data) {
    const invoice = new Invoice(data);
    await invoice.save();
    return invoice;
  }

  static async deleteInvoice(id) {
    return await Invoice.findByIdAndDelete(id);
  }

  // ================= Waste =================
  static async getWasteRecords(filter = {}) {
    const query = {};
    if (filter.month && filter.month !== "all") query.month = filter.month;
    return await Waste.find(query).sort({ wasteDate: -1, createdAt: -1 }).lean();
  }

  static async createWasteRecord(data) {
    const waste = new Waste(data);
    await waste.save();
    return waste;
  }

  static async deleteWasteRecord(id) {
    return await Waste.findByIdAndDelete(id);
  }

  // ================= Sales =================
  static async getSalesRecords(filter = {}) {
    const query = {};
    if (filter.month && filter.month !== "all") query.month = filter.month;
    return await SalesRecord.find(query).sort({ recordDate: -1, createdAt: -1 }).lean();
  }

  static async createSalesRecord(data) {
    const sales = new SalesRecord(data);
    await sales.save();
    return sales;
  }

  static async deleteSalesRecord(id) {
    return await SalesRecord.findByIdAndDelete(id);
  }
}

module.exports = AccountingService;

