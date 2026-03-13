import { normalizeNiceClassCode } from "./nice-classes";

export type TrademarkSimilarityMatchType =
  | "exact"
  | "prefix"
  | "contains"
  | "boundary_token"
  | "token_overlap"
  | "none";

export type TrademarkNameSimilarity = {
  normalizedTarget: string;
  normalizedCandidate: string;
  matchType: TrademarkSimilarityMatchType;
  score: number;
  sharedExactTokens: string[];
  overlapRatio: number;
};

export type TrademarkCollisionAnalysis = TrademarkNameSimilarity & {
  collisionScore: number;
  sameClass: boolean;
  classBonus: number;
  targetClass: string | null;
  candidateClass: string | null;
};

export function normalizeTrademarkTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokenizeNormalizedTrademark(value: string): string[] {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function tokensAreCloselyRelated(candidateToken: string, queryToken: string): boolean {
  return (
    candidateToken === queryToken ||
    candidateToken.startsWith(queryToken) ||
    (queryToken.startsWith(candidateToken) &&
      candidateToken.length >= Math.max(4, queryToken.length - 1))
  );
}

export function hasBoundaryTokenMatch(
  normalizedCandidate: string,
  normalizedQuery: string,
): boolean {
  const candidateTokens = tokenizeNormalizedTrademark(normalizedCandidate);
  const queryTokens = tokenizeNormalizedTrademark(normalizedQuery);

  if (!candidateTokens.length || !queryTokens.length) {
    return false;
  }

  if (queryTokens.length === 1) {
    const query = queryTokens[0];
    return candidateTokens.some((candidate) => tokensAreCloselyRelated(candidate, query));
  }

  return queryTokens.every((query) =>
    candidateTokens.some((candidate) => tokensAreCloselyRelated(candidate, query)),
  );
}

export function analyzeTrademarkNameSimilarity(
  targetNormalized: string,
  candidateValue: string,
  options?: { candidateAlreadyNormalized?: boolean },
): TrademarkNameSimilarity {
  const normalizedTarget = normalizeTrademarkTerm(targetNormalized);
  const normalizedCandidate = options?.candidateAlreadyNormalized
    ? candidateValue.replace(/\s+/g, " ").trim().toLowerCase()
    : normalizeTrademarkTerm(candidateValue);

  const emptyResult: TrademarkNameSimilarity = {
    normalizedTarget,
    normalizedCandidate,
    matchType: "none",
    score: 0,
    sharedExactTokens: [],
    overlapRatio: 0,
  };

  if (!normalizedTarget || !normalizedCandidate) {
    return emptyResult;
  }

  if (normalizedCandidate === normalizedTarget) {
    return {
      ...emptyResult,
      matchType: "exact",
      score: 100,
    };
  }

  if (
    normalizedCandidate.startsWith(normalizedTarget) ||
    normalizedTarget.startsWith(normalizedCandidate)
  ) {
    return {
      ...emptyResult,
      matchType: "prefix",
      score: 92,
    };
  }

  if (
    normalizedCandidate.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedCandidate)
  ) {
    return {
      ...emptyResult,
      matchType: "contains",
      score: 88,
    };
  }

  if (hasBoundaryTokenMatch(normalizedCandidate, normalizedTarget)) {
    return {
      ...emptyResult,
      matchType: "boundary_token",
      score: 82,
    };
  }

  const targetTokens = tokenizeNormalizedTrademark(normalizedTarget).filter(
    (token) => token.length >= 3,
  );
  const candidateTokens = tokenizeNormalizedTrademark(normalizedCandidate).filter(
    (token) => token.length >= 3,
  );
  const candidateSet = new Set(candidateTokens);
  const sharedExactTokens = targetTokens.filter((token) => candidateSet.has(token));
  const overlapRatio = targetTokens.length ? sharedExactTokens.length / targetTokens.length : 0;

  if (overlapRatio >= 0.8) {
    return {
      ...emptyResult,
      matchType: "token_overlap",
      score: 72,
      sharedExactTokens,
      overlapRatio,
    };
  }

  if (overlapRatio >= 0.5) {
    return {
      ...emptyResult,
      matchType: "token_overlap",
      score: 60,
      sharedExactTokens,
      overlapRatio,
    };
  }

  if (sharedExactTokens.length > 0) {
    return {
      ...emptyResult,
      matchType: "token_overlap",
      score: 45,
      sharedExactTokens,
      overlapRatio,
    };
  }

  return emptyResult;
}

export function analyzeTrademarkCollision(input: {
  targetNormalized: string;
  candidateName: string;
  targetClass?: string | null;
  candidateClass?: string | null;
  candidateNormalizedName?: string | null;
}): TrademarkCollisionAnalysis {
  const nameAnalysis = analyzeTrademarkNameSimilarity(
    input.targetNormalized,
    input.candidateNormalizedName || input.candidateName,
    {
      candidateAlreadyNormalized: Boolean(input.candidateNormalizedName),
    },
  );

  const targetClass = normalizeNiceClassCode(input.targetClass) || null;
  const candidateClass = normalizeNiceClassCode(input.candidateClass) || null;
  const sameClass = Boolean(targetClass && candidateClass && targetClass === candidateClass);
  const classBonus = sameClass ? 10 : 0;

  return {
    ...nameAnalysis,
    targetClass,
    candidateClass,
    sameClass,
    classBonus,
    collisionScore: Math.min(nameAnalysis.score + classBonus, 100),
  };
}

export function summarizeTrademarkCollisionJustification(
  analysis: TrademarkCollisionAnalysis,
): string {
  const classText = analysis.sameClass ? " e mesma classe NICE" : "";

  if (analysis.matchType === "exact") {
    return `Marca idêntica detectada${classText}.`;
  }

  if (analysis.matchType === "prefix" || analysis.matchType === "contains") {
    return `Expressão marcária quase integralmente coincidente${classText}.`;
  }

  if (analysis.matchType === "boundary_token") {
    return `Variação nominal muito próxima nos termos principais${classText}.`;
  }

  if (analysis.matchType === "token_overlap") {
    const tokenLabel =
      analysis.sharedExactTokens.length > 1 ? "tokens dominantes" : "token dominante";

    return `Compartilha ${tokenLabel} relevantes com a marca pesquisada${classText}.`;
  }

  return analysis.sameClass
    ? "Semelhança parcial detectada na mesma classe NICE."
    : "Semelhança parcial detectada na base global.";
}
