import { SearchX, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  onResetFilters?: () => void;
}

export function EmptyState({ 
  title = "해당 기간의 데이터가 없습니다",
  description = "다른 월이나 필터 설정을 시도해 보세요.",
  onResetFilters 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <SearchX className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-title">
        {title}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-sm" data-testid="text-empty-description">
        {description}
      </p>
      {onResetFilters && (
        <Button variant="outline" onClick={onResetFilters} data-testid="button-reset-filters">
          <SlidersHorizontal className="w-4 h-4 mr-2" />
          필터 초기화
        </Button>
      )}
    </div>
  );
}
