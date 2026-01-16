import { type User, type InsertUser, type RadarModel, type InsertRadarModel } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Radar models
  getRadarModels(month: string, nation: string): Promise<RadarModel[]>;
  getAvailableMonths(): Promise<string[]>;
  upsertRadarModels(models: InsertRadarModel[]): Promise<RadarModel[]>;
}

// Sample data for demonstration
function generateSampleData(): RadarModel[] {
  const currentDate = new Date();
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  
  const domesticModels: Partial<RadarModel>[] = [
    { modelName: "그랜저", brand: "현대", sales: 8542, prevSales: 6320, rank: 1, prevRank: 3 },
    { modelName: "아반떼", brand: "현대", sales: 7823, prevSales: 6890, rank: 2, prevRank: 4 },
    { modelName: "쏘렌토", brand: "기아", sales: 7456, prevSales: 5210, rank: 3, prevRank: 8 },
    { modelName: "카니발", brand: "기아", sales: 6890, prevSales: 5890, rank: 4, prevRank: 5 },
    { modelName: "싼타페", brand: "현대", sales: 6234, prevSales: 4567, rank: 5, prevRank: 9 },
    { modelName: "K5", brand: "기아", sales: 5678, prevSales: 4890, rank: 6, prevRank: 7 },
    { modelName: "투싼", brand: "현대", sales: 5456, prevSales: 3210, rank: 7, prevRank: 15 },
    { modelName: "셀토스", brand: "기아", sales: 5123, prevSales: 4567, rank: 8, prevRank: 10 },
    { modelName: "스포티지", brand: "기아", sales: 4890, prevSales: 3890, rank: 9, prevRank: 11 },
    { modelName: "팰리세이드", brand: "현대", sales: 4567, prevSales: 3456, rank: 10, prevRank: 13 },
    { modelName: "코나", brand: "현대", sales: 4234, prevSales: 2890, rank: 11, prevRank: 18 },
    { modelName: "니로", brand: "기아", sales: 3890, prevSales: 3120, rank: 12, prevRank: 14 },
    { modelName: "아이오닉 6", brand: "현대", sales: 3678, prevSales: 2340, rank: 13, prevRank: 20 },
    { modelName: "EV6", brand: "기아", sales: 3456, prevSales: 2890, rank: 14, prevRank: 16 },
    { modelName: "G80", brand: "제네시스", sales: 3234, prevSales: 2678, rank: 15, prevRank: 17 },
    { modelName: "GV70", brand: "제네시스", sales: 2890, prevSales: 1890, rank: 16, prevRank: 22 },
    { modelName: "베뉴", brand: "현대", sales: 2678, prevSales: 2345, rank: 17, prevRank: 19 },
    { modelName: "모닝", brand: "기아", sales: 2456, prevSales: 2120, rank: 18, prevRank: 21 },
    { modelName: "스타리아", brand: "현대", sales: 2234, prevSales: 0, rank: 19, prevRank: null },
    { modelName: "레이", brand: "기아", sales: 2012, prevSales: 1890, rank: 20, prevRank: 23 },
    { modelName: "아이오닉 5", brand: "현대", sales: 1890, prevSales: 1456, rank: 21, prevRank: 25 },
    { modelName: "쏘나타", brand: "현대", sales: 1678, prevSales: 1234, rank: 22, prevRank: 27 },
    { modelName: "G90", brand: "제네시스", sales: 1456, prevSales: 890, rank: 23, prevRank: 30 },
    { modelName: "K8", brand: "기아", sales: 1234, prevSales: 1120, rank: 24, prevRank: 26 },
    { modelName: "GV80", brand: "제네시스", sales: 1012, prevSales: 780, rank: 25, prevRank: 32 },
  ];

  const exportModels: Partial<RadarModel>[] = [
    { modelName: "E-클래스", brand: "벤츠", sales: 3245, prevSales: 2456, rank: 1, prevRank: 2 },
    { modelName: "5시리즈", brand: "BMW", sales: 2890, prevSales: 2120, rank: 2, prevRank: 4 },
    { modelName: "RAV4", brand: "토요타", sales: 2678, prevSales: 1890, rank: 3, prevRank: 7 },
    { modelName: "Model Y", brand: "테슬라", sales: 2456, prevSales: 1678, rank: 4, prevRank: 9 },
    { modelName: "A6", brand: "아우디", sales: 2234, prevSales: 1890, rank: 5, prevRank: 6 },
    { modelName: "GLC", brand: "벤츠", sales: 2012, prevSales: 1456, rank: 6, prevRank: 10 },
    { modelName: "X5", brand: "BMW", sales: 1890, prevSales: 1234, rank: 7, prevRank: 12 },
    { modelName: "캠리", brand: "토요타", sales: 1678, prevSales: 1345, rank: 8, prevRank: 11 },
    { modelName: "Q5", brand: "아우디", sales: 1567, prevSales: 1120, rank: 9, prevRank: 14 },
    { modelName: "Model 3", brand: "테슬라", sales: 1456, prevSales: 1234, rank: 10, prevRank: 13 },
    { modelName: "XC60", brand: "볼보", sales: 1345, prevSales: 890, rank: 11, prevRank: 18 },
    { modelName: "카이엔", brand: "포르쉐", sales: 1234, prevSales: 1012, rank: 12, prevRank: 15 },
    { modelName: "마칸", brand: "포르쉐", sales: 1123, prevSales: 890, rank: 13, prevRank: 17 },
    { modelName: "레인지로버", brand: "랜드로버", sales: 1012, prevSales: 0, rank: 14, prevRank: null },
    { modelName: "디펜더", brand: "랜드로버", sales: 945, prevSales: 678, rank: 15, prevRank: 20 },
    { modelName: "S-클래스", brand: "벤츠", sales: 890, prevSales: 756, rank: 16, prevRank: 19 },
    { modelName: "7시리즈", brand: "BMW", sales: 834, prevSales: 567, rank: 17, prevRank: 23 },
    { modelName: "ES", brand: "렉서스", sales: 778, prevSales: 623, rank: 18, prevRank: 21 },
    { modelName: "RX", brand: "렉서스", sales: 723, prevSales: 0, rank: 19, prevRank: null },
    { modelName: "타이칸", brand: "포르쉐", sales: 667, prevSales: 456, rank: 20, prevRank: 25 },
  ];

  const processModels = (models: Partial<RadarModel>[], nation: string): RadarModel[] => {
    return models.map((model, idx) => {
      const sales = model.sales ?? 0;
      const prevSales = model.prevSales ?? 0;
      const momAbs = sales - prevSales;
      const momPct = prevSales > 0 ? momAbs / prevSales : (sales > 0 ? 5 : 0); // Cap at 500%
      const rankChange = model.prevRank ? model.prevRank - (model.rank ?? 0) : 0;
      
      // Calculate composite score
      const zMomAbs = momAbs / 1000; // Normalize
      const zMomPct = Math.min(momPct, 5); // Cap percentage
      const zRankChange = rankChange / 5; // Normalize
      const score = 0.55 * zMomAbs + 0.35 * zMomPct + 0.10 * zRankChange;

      return {
        id: randomUUID(),
        month: currentMonth,
        nation,
        rank: model.rank ?? idx + 1,
        prevRank: model.prevRank ?? null,
        modelName: model.modelName ?? "",
        brand: model.brand ?? "",
        sales,
        prevSales: prevSales || null,
        momAbs,
        momPct: Math.min(momPct, 5),
        rankChange,
        score,
        sourceUrl: `https://auto.danawa.com/auto/?Month=${currentMonth}-00&Nation=${nation}&Tab=Model&Work=record`,
      };
    });
  };

  return [
    ...processModels(domesticModels, "domestic"),
    ...processModels(exportModels, "export"),
  ];
}

// Generate previous month data
function generatePreviousMonthData(): RadarModel[] {
  const currentDate = new Date();
  currentDate.setMonth(currentDate.getMonth() - 1);
  const prevMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  
  const domesticModels: Partial<RadarModel>[] = [
    { modelName: "그랜저", brand: "현대", sales: 6320, prevSales: 5890, rank: 3, prevRank: 4 },
    { modelName: "아반떼", brand: "현대", sales: 6890, prevSales: 6234, rank: 4, prevRank: 3 },
    { modelName: "쏘렌토", brand: "기아", sales: 5210, prevSales: 4890, rank: 8, prevRank: 9 },
    { modelName: "카니발", brand: "기아", sales: 5890, prevSales: 5456, rank: 5, prevRank: 6 },
    { modelName: "싼타페", brand: "현대", sales: 4567, prevSales: 4120, rank: 9, prevRank: 10 },
    { modelName: "K5", brand: "기아", sales: 4890, prevSales: 4567, rank: 7, prevRank: 8 },
    { modelName: "투싼", brand: "현대", sales: 3210, prevSales: 2890, rank: 15, prevRank: 17 },
    { modelName: "셀토스", brand: "기아", sales: 4567, prevSales: 4234, rank: 10, prevRank: 11 },
    { modelName: "스포티지", brand: "기아", sales: 3890, prevSales: 3567, rank: 11, prevRank: 12 },
    { modelName: "팰리세이드", brand: "현대", sales: 3456, prevSales: 3120, rank: 13, prevRank: 14 },
  ];

  const exportModels: Partial<RadarModel>[] = [
    { modelName: "E-클래스", brand: "벤츠", sales: 2456, prevSales: 2120, rank: 2, prevRank: 3 },
    { modelName: "5시리즈", brand: "BMW", sales: 2120, prevSales: 1890, rank: 4, prevRank: 5 },
    { modelName: "RAV4", brand: "토요타", sales: 1890, prevSales: 1567, rank: 7, prevRank: 8 },
    { modelName: "Model Y", brand: "테슬라", sales: 1678, prevSales: 1234, rank: 9, prevRank: 12 },
    { modelName: "A6", brand: "아우디", sales: 1890, prevSales: 1678, rank: 6, prevRank: 7 },
    { modelName: "GLC", brand: "벤츠", sales: 1456, prevSales: 1234, rank: 10, prevRank: 11 },
    { modelName: "X5", brand: "BMW", sales: 1234, prevSales: 1012, rank: 12, prevRank: 14 },
    { modelName: "캠리", brand: "토요타", sales: 1345, prevSales: 1120, rank: 11, prevRank: 13 },
    { modelName: "Q5", brand: "아우디", sales: 1120, prevSales: 890, rank: 14, prevRank: 16 },
    { modelName: "Model 3", brand: "테슬라", sales: 1234, prevSales: 1012, rank: 13, prevRank: 15 },
  ];

  const processModels = (models: Partial<RadarModel>[], nation: string): RadarModel[] => {
    return models.map((model, idx) => {
      const sales = model.sales ?? 0;
      const prevSales = model.prevSales ?? 0;
      const momAbs = sales - prevSales;
      const momPct = prevSales > 0 ? momAbs / prevSales : 0;
      const rankChange = model.prevRank ? model.prevRank - (model.rank ?? 0) : 0;
      const score = 0.55 * (momAbs / 1000) + 0.35 * Math.min(momPct, 5) + 0.10 * (rankChange / 5);

      return {
        id: randomUUID(),
        month: prevMonth,
        nation,
        rank: model.rank ?? idx + 1,
        prevRank: model.prevRank ?? null,
        modelName: model.modelName ?? "",
        brand: model.brand ?? "",
        sales,
        prevSales: prevSales || null,
        momAbs,
        momPct: Math.min(momPct, 5),
        rankChange,
        score,
        sourceUrl: `https://auto.danawa.com/auto/?Month=${prevMonth}-00&Nation=${nation}&Tab=Model&Work=record`,
      };
    });
  };

  return [
    ...processModels(domesticModels, "domestic"),
    ...processModels(exportModels, "export"),
  ];
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private radarModels: Map<string, RadarModel>;

  constructor() {
    this.users = new Map();
    this.radarModels = new Map();
    
    // Initialize with sample data
    const sampleData = [...generateSampleData(), ...generatePreviousMonthData()];
    sampleData.forEach((model) => {
      this.radarModels.set(model.id, model);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getRadarModels(month: string, nation: string): Promise<RadarModel[]> {
    const models = Array.from(this.radarModels.values()).filter(
      (model) => model.month === month && model.nation === nation
    );
    return models.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  async getAvailableMonths(): Promise<string[]> {
    const months = new Set<string>();
    Array.from(this.radarModels.values()).forEach((model) => {
      months.add(model.month);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a)); // Descending order
  }

  async upsertRadarModels(models: InsertRadarModel[]): Promise<RadarModel[]> {
    const results: RadarModel[] = [];
    for (const model of models) {
      const id = randomUUID();
      const radarModel: RadarModel = { ...model, id };
      this.radarModels.set(id, radarModel);
      results.push(radarModel);
    }
    return results;
  }
}

export const storage = new MemStorage();
