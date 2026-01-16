import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { FiltersPanel } from "@/components/filters-panel";
import { ModelCard } from "@/components/model-card";
import { ModelCardSkeleton } from "@/components/model-card-skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import type { RadarApiResponse, FilterOptions } from "@shared/schema";

const DEFAULT_FILTERS: FilterOptions = {
  minSales: 300,
  excludeNewEntries: false,
};

function buildApiUrl(month: string, nation: string, filters: FilterOptions): string {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  params.set("nation", nation);
  params.set("minSales", filters.minSales.toString());
  params.set("excludeNewEntries", filters.excludeNewEntries.toString());
  params.set("limit", "20");
  return `/api/radar?${params.toString()}`;
}

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedNation, setSelectedNation] = useState<"domestic" | "export">("domestic");
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);

  const apiUrl = buildApiUrl(selectedMonth, selectedNation, filters);
  
  const { data, isLoading, isError, refetch } = useQuery<RadarApiResponse>({
    queryKey: ["/api/radar", selectedMonth, selectedNation, filters.minSales, filters.excludeNewEntries],
    queryFn: async () => {
      const response = await fetch(apiUrl, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch radar data");
      return response.json();
    },
  });

  const availableMonths = data?.availableMonths || [];
  
  // Auto-select latest month if not selected
  const effectiveMonth = selectedMonth || (availableMonths.length > 0 ? availableMonths[0] : "");

  // Models are already filtered/sorted by the API
  const filteredModels = data?.models || [];

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        selectedMonth={effectiveMonth}
        onMonthChange={handleMonthChange}
        availableMonths={availableMonths}
        selectedNation={selectedNation}
        onNationChange={setSelectedNation}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            Top 20 급상승 모델
          </h2>
          <p className="text-muted-foreground">
            전월 대비 판매량과 순위가 가장 많이 상승한 모델들입니다.
          </p>
        </div>

        <FiltersPanel
          filters={filters}
          onFiltersChange={setFilters}
          resultCount={filteredModels.length}
        />

        {isLoading && (
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            data-testid="loading-skeleton"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <ModelCardSkeleton key={i} />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && filteredModels.length === 0 && (
          <EmptyState onResetFilters={handleResetFilters} />
        )}

        {!isLoading && !isError && filteredModels.length > 0 && (
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            data-testid="models-grid"
          >
            {filteredModels.map((model, index) => (
              <ModelCard 
                key={model.id} 
                model={model} 
                displayRank={index + 1}
              />
            ))}
          </div>
        )}

        <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            데이터 출처:{" "}
            <a 
              href="https://auto.danawa.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              다나와 자동차
            </a>
            {" "}(KAMA/KAIDA 공식 자료 기반)
          </p>
          <p className="mt-1">
            국산 모델: 매월 1일/25일 갱신 | 수입 모델: 매월 15일경 갱신
          </p>
        </footer>
      </main>
    </div>
  );
}
