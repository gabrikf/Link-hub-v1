/**
 * The golden query set for recruiter search, in TREC shape: a query plus graded
 * judgements over the corpus in `search-corpus.ts`.
 *
 * Grades follow the usual 0..3 scale, and the *reason* for each grade is what
 * makes the set worth having:
 *   3 — exactly the person the recruiter asked for
 *   2 — a strong candidate who would get an interview
 *   1 — adjacent; worth showing far down the page, not at the top
 *   0 — wrong role family (left implicit: anything unjudged is 0)
 *
 * Judgements are deliberately *not* derived from what the current ranker
 * returns. They encode a human reading of the corpus text, which is the only
 * way an eval can catch the ranker getting worse.
 */

export interface GoldenQuery {
  id: string;
  /** What a recruiter would actually type. */
  query: string;
  /** candidate id -> graded relevance, 0..3. */
  judgements: Record<string, number>;
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  {
    id: "q1-react-node-fullstack",
    query:
      "senior full stack engineer with react and node.js building typescript web applications on postgresql",
    judgements: {
      "fullstack-1": 3,
      "fullstack-2": 3,
      "accented-location": 2,
      "frontend-1": 2,
      "backend-1": 2,
      "mobile-3": 1,
      "no-salary": 1,
    },
  },
  {
    id: "q2-ios-native",
    query: "ios engineer swift swiftui native mobile applications app store",
    judgements: {
      "mobile-1": 3,
      "mobile-3": 2,
      "mobile-2": 1,
    },
  },
  {
    id: "q3-data-pipelines",
    query:
      "data engineer python spark airflow sql building warehouse pipelines",
    judgements: {
      "data-1": 3,
      "data-2": 2,
      "ml-1": 1,
      "ml-2": 1,
    },
  },
  {
    id: "q4-kubernetes-sre",
    query:
      "site reliability engineer kubernetes terraform aws infrastructure as code observability",
    judgements: {
      "devops-1": 3,
      "devops-2": 3,
    },
  },
  {
    id: "q5-machine-learning",
    query:
      "machine learning engineer pytorch transformers training and serving deep learning models",
    judgements: {
      "ml-1": 3,
      "ml-2": 2,
      "data-1": 1,
    },
  },
  {
    id: "q6-frontend-only",
    query: "frontend engineer react next.js css component library accessible",
    judgements: {
      "frontend-1": 3,
      "fullstack-1": 2,
      "fullstack-2": 2,
      "accented-location": 1,
    },
  },
];

export function toQrelsByQuery(
  queries: GoldenQuery[] = GOLDEN_QUERIES,
): Map<string, Map<string, number>> {
  return new Map(
    queries.map((query) => [
      query.id,
      new Map(Object.entries(query.judgements)),
    ]),
  );
}
