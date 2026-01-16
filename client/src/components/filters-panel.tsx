import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SlidersHorizontal } from "lucide-react";
import type { FilterOptions } from "@shared/schema";

interface FiltersPanelProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  resultCount: number;
}

export function FiltersPanel({ filters, onFiltersChange, resultCount }: FiltersPanelProps) {
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="w-4 h-4" />
            <span>필터</span>
          </div>

          <div className="flex-1 flex flex-col md:flex-row gap-6 md:items-center">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="min-sales" className="text-sm">
                  최소 판매량
                </Label>
                <span className="text-sm font-medium tabular-nums" data-testid="text-min-sales-value">
                  {filters.minSales.toLocaleString("ko-KR")}대 이상
                </span>
              </div>
              <Slider
                id="min-sales"
                min={0}
                max={5000}
                step={100}
                value={[filters.minSales]}
                onValueChange={([value]) => 
                  onFiltersChange({ ...filters, minSales: value })
                }
                className="w-full"
                data-testid="slider-min-sales"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-new"
                checked={filters.excludeNewEntries}
                onCheckedChange={(checked) =>
                  onFiltersChange({ ...filters, excludeNewEntries: checked === true })
                }
                data-testid="checkbox-exclude-new"
              />
              <Label htmlFor="exclude-new" className="text-sm cursor-pointer">
                신규 진입 모델 제외
              </Label>
            </div>
          </div>

          <div className="text-sm text-muted-foreground whitespace-nowrap" data-testid="text-result-count">
            {resultCount}개 모델
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
