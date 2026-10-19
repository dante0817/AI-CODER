import { RepoFile, RankedContextFile, ContextRetrievalResult } from '../types';

export interface ContextExtractionParams {
  prompt: string;
  activeFilePath: string;
  selectedText?: string;
  maxCharsBudget?: number;
}

export function extractSymbolsAndKeywords(prompt: string, selectedText?: string): { keywords: string[]; symbols: string[] } {
  const combinedText = `${prompt} ${selectedText || ''}`;
  
  // Extract potential code symbols (CamelCase, snake_case, function-like names)
  const symbolMatches = combinedText.match(/\b([A-Z][a-zA-Z0-9]+|[a-z0-9]+_[a-z0-9_]+|[A-Z_]{3,})\b/g) || [];
  const uniqueSymbols = Array.from(new Set(symbolMatches)).filter(s => s.length > 2);

  // Extract keywords (stopword-filtered)
  const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'were', 'when', 'what', 'which', 'there', 'their', 'some', 'could', 'should', 'would', 'here', 'into', 'only', 'about', 'also', 'after', 'before']);
  const words = combinedText.toLowerCase().replace(/[^a-z0-9_\s]/g, ' ').split(/\s+/);
  const keywords = Array.from(new Set(words)).filter(w => w.length >= 3 && !stopwords.has(w));

  return {
    keywords,
    symbols: uniqueSymbols
  };
}

export function runSmartContextRetrieval(
  allFiles: RepoFile[],
  params: ContextExtractionParams
): ContextRetrievalResult {
  const maxBudget = params.maxCharsBudget || 80000;
  const { keywords, symbols } = extractSymbolsAndKeywords(params.prompt, params.selectedText);

  const activeFile = allFiles.find(f => f.path === params.activeFilePath);
  const directImports = new Set<string>();

  if (activeFile) {
    activeFile.imports.forEach(imp => {
      // e.g. 'src.checkout.payment_gateway' -> 'src/checkout/payment_gateway.py'
      const normalized = imp.replace(/\./g, '/');
      directImports.add(normalized);
    });
  }

  const activeModuleDir = params.activeFilePath.includes('/') 
    ? params.activeFilePath.substring(0, params.activeFilePath.lastIndexOf('/'))
    : '';

  const rankedCandidates: RankedContextFile[] = [];
  const excludedSensitiveFiles: string[] = [];

  for (const file of allFiles) {
    // SECURITY FILTER 1: Sensitive file exclusion (.env, secrets)
    if (file.isSensitive) {
      excludedSensitiveFiles.push(`${file.path} (Sensitive credentials/env pattern)`);
      continue;
    }

    // SECURITY FILTER 2: Control directory exclusion (.ai-coder/ internal state)
    if (file.isControlFile || file.path.startsWith('.ai-coder/')) {
      excludedSensitiveFiles.push(`${file.path} (Internal AI-CODER control directory)`);
      continue;
    }

    let score = 0;
    const reasons: string[] = [];

    // 1. Active File (Highest priority)
    if (file.path === params.activeFilePath) {
      score += 1000;
      reasons.push('Active editor file (Primary context focus)');
    }

    // 2. Direct Import of Active File
    const normalizedFilePathNoExt = file.path.replace(/\.[^/.]+$/, '');
    for (const imp of directImports) {
      if (normalizedFilePathNoExt.endsWith(imp) || file.path.includes(imp)) {
        score += 500;
        reasons.push(`Direct dependency imported by active file (${imp})`);
        break;
      }
    }

    // 3. Companion Test File Relationship
    const activeFileName = params.activeFilePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
    const isCompanionTest = (
      file.path.startsWith('tests/') &&
      (file.path.includes(activeFileName) || file.symbols.some(s => s.toLowerCase().includes(activeFileName.toLowerCase())))
    );
    if (isCompanionTest) {
      score += 420;
      reasons.push(`Companion unit/integration test for active module (${activeFileName})`);
    }

    // 4. Same module directory sibling
    if (activeModuleDir && file.path.startsWith(activeModuleDir) && file.path !== params.activeFilePath) {
      score += 180;
      reasons.push(`Co-located module sibling in '${activeModuleDir}/'`);
    }

    // 5. Symbol Match
    let symbolMatchesCount = 0;
    for (const sym of symbols) {
      if (file.symbols.includes(sym)) {
        symbolMatchesCount++;
      } else if (file.content.includes(sym)) {
        symbolMatchesCount += 0.5;
      }
    }
    if (symbolMatchesCount > 0) {
      const symScore = Math.min(300, symbolMatchesCount * 90);
      score += symScore;
      reasons.push(`Matched referenced symbols (${symbolMatchesCount} occurrences)`);
    }

    // 6. Keyword Match in Path or Content
    let keywordHits = 0;
    for (const kw of keywords) {
      if (file.path.toLowerCase().includes(kw)) {
        keywordHits += 2;
      } else if (file.content.toLowerCase().includes(kw)) {
        keywordHits += 0.5;
      }
    }
    if (keywordHits > 0) {
      const kwScore = Math.min(150, Math.floor(keywordHits * 20));
      score += kwScore;
      reasons.push(`Keyword relevance hit in path/content (+${kwScore} pts)`);
    }

    // Deprioritize docs or archive files unless explicitly mentioned in prompt
    if (file.path.includes('archive/') || file.path.includes('docs/')) {
      const mentioned = keywords.some(k => file.path.toLowerCase().includes(k));
      if (!mentioned) {
        score -= 200;
        reasons.push(`Low coding relevance penalty (docs/archive file not referenced in query)`);
      }
    }

    rankedCandidates.push({
      file,
      relevanceScore: Math.max(0, score),
      reasons: reasons.length > 0 ? reasons : ['General workspace file'],
      includedInBudget: false,
      cumulativeChars: 0
    });
  }

  // Sort descending by relevance score
  rankedCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Pack context within budget
  let currentUsedChars = 0;
  let includedCount = 0;

  for (const candidate of rankedCandidates) {
    if (currentUsedChars + candidate.file.characters <= maxBudget) {
      candidate.includedInBudget = true;
      currentUsedChars += candidate.file.characters;
      candidate.cumulativeChars = currentUsedChars;
      includedCount++;
    } else {
      candidate.includedInBudget = false;
      candidate.cumulativeChars = currentUsedChars;
    }
  }

  // Compute comparison with naive alphabetical scanner
  // Naive alphabetical sorted by path up to 80,000 characters:
  const alphabeticalFiles = [...allFiles]
    .filter(f => !f.isSensitive && !f.isControlFile)
    .sort((a, b) => a.path.localeCompare(b.path));

  let naiveChars = 0;
  let naiveIncludedCount = 0;
  let naiveWastedBudgetOnDocsOrArchive = 0;
  const naiveIncludedPaths = new Set<string>();

  for (const f of alphabeticalFiles) {
    if (naiveChars + f.characters <= maxBudget) {
      naiveChars += f.characters;
      naiveIncludedCount++;
      naiveIncludedPaths.add(f.path);
      if (f.path.includes('archive/') || f.path.includes('docs/')) {
        naiveWastedBudgetOnDocsOrArchive += f.characters;
      }
    }
  }

  // Find high relevance files missed by naive alphabetical scan
  const topRelevantPaths = rankedCandidates.slice(0, 4).map(c => c.file.path);
  const naiveMissedRelevantFiles = topRelevantPaths.filter(p => !naiveIncludedPaths.has(p));

  return {
    query: params.prompt,
    activeFilePath: params.activeFilePath,
    selectedText: params.selectedText,
    extractedKeywords: keywords,
    extractedSymbols: symbols,
    rankedFiles: rankedCandidates,
    excludedSensitiveFiles,
    totalCharsBudget: maxBudget,
    usedCharsBudget: currentUsedChars,
    filesIncludedCount: includedCount,
    filesTotalCount: allFiles.length,
    comparisonWithNaiveAlphabetical: {
      naiveIncludedCount,
      naiveMissedRelevantFiles,
      naiveWastedBudgetOnDocsOrArchive
    }
  };
}
