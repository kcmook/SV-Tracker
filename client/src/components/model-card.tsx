import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ExternalLink, Sparkles } from "lucide-react";
import type { RadarModel } from "@shared/schema";

interface ModelCardProps {
  model: RadarModel;
  displayRank: number;
}

export function ModelCard({ model, displayRank }: ModelCardProps) {
  const isNewEntry = model.prevSales === 0 || model.prevSales === null;
  
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    return num.toLocaleString("ko-KR");
  };

  const formatPercent = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    const capped = Math.min(num * 100, 999);
    return `${capped >= 0 ? "+" : ""}${capped.toFixed(1)}%`;
  };

  const formatChange = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    return `${num >= 0 ? "+" : ""}${num.toLocaleString("ko-KR")}`;
  };

  const formatRankChange = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    if (num === 0) return "-";
    return num > 0 ? `${num}` : `${Math.abs(num)}`;
  };

  const handleViewSource = () => {
    if (model.sourceUrl) {
      window.open(model.sourceUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card 
      className="transition-transform duration-200"
      data-testid={`card-model-${model.id}`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">
              {displayRank}
            </div>
            <div>
              <h3 className="font-semibold text-lg leading-tight" data-testid={`text-model-name-${model.id}`}>
                {model.modelName}
              </h3>
              <p className="text-sm text-muted-foreground">{model.brand}</p>
            </div>
          </div>
          {isNewEntry && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              신규
            </Badge>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">판매량</span>
            <span className="text-2xl font-bold tabular-nums" data-testid={`text-sales-${model.id}`}>
              {formatNumber(model.sales)}
              <span className="text-sm font-normal text-muted-foreground ml-1">대</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">전월대비</span>
              <div className="flex items-center gap-2">
                {(model.momAbs ?? 0) > 0 && (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                )}
                <span 
                  className={`font-semibold tabular-nums ${
                    (model.momAbs ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    (model.momAbs ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""
                  }`}
                  data-testid={`text-mom-abs-${model.id}`}
                >
                  {formatChange(model.momAbs)}대
                </span>
              </div>
              <span 
                className={`text-sm tabular-nums ${
                  (model.momPct ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                  (model.momPct ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                }`}
                data-testid={`text-mom-pct-${model.id}`}
              >
                {formatPercent(model.momPct)}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">순위변동</span>
              <div className="flex items-center gap-2">
                {(model.rankChange ?? 0) > 0 && (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                )}
                {(model.rankChange ?? 0) !== 0 && (
                  <span 
                    className={`font-semibold tabular-nums ${
                      (model.rankChange ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                      "text-red-600 dark:text-red-400"
                    }`}
                    data-testid={`text-rank-change-${model.id}`}
                  >
                    {(model.rankChange ?? 0) > 0 ? "▲" : "▼"}{formatRankChange(model.rankChange)}
                  </span>
                )}
                {(model.rankChange ?? 0) === 0 && (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {model.prevRank ? `${model.prevRank}위 → ${model.rank}위` : `${model.rank}위`}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleViewSource}
            disabled={!model.sourceUrl}
            data-testid={`button-source-${model.id}`}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            다나와 원문 보기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
