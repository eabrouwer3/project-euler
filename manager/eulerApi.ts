import { NodeHtmlMarkdown } from 'npm:node-html-markdown'

export type EulerProblem = {
  id: number;
  title: string;
  published: Date;
  solvedBy: number;
  lastPoster: string;
  lastPostDate: Date;
  solveStatus?: boolean;
}

/**
 * Gets all of the problems and returns in them in ascending order
 * @returns Sorted ascending list of Project Euler Problems
 */
export async function getAllProblems(): Promise<Array<EulerProblem>> {
  const problemList = await fetch('https://projecteuler.net/minimal=problems')
  const rows = (await problemList.text()).split('\n').slice(1)
  return rows.map((str) => {
    const [id, title, published, solvedBy, lastPoster, lastPostDate, solveStatus] = str.split('##')
    return {
      id: Number.parseInt(id, 10),
      title,
      published: new Date(Number.parseInt(published, 10) * 1000),
      solvedBy: Number.parseInt(solvedBy, 10),
      lastPoster,
      lastPostDate: new Date(Number.parseInt(lastPostDate, 10) * 1000),
      solveStatus: solveStatus === '1',
    } as EulerProblem;
  }).sort(({id: a}, {id: b}) => a - b)
}

export async function getLatestProblemId(): Promise<number | undefined> {
  return (await getAllProblems()).at(-1)?.id
}

export async function getProblemMarkdown(n: number): Promise<string> {
  const problem = await fetch(`https://projecteuler.net/minimal=${n}`)
  const problemTxt = await problem.text()
  const problemMd = NodeHtmlMarkdown.translate(
    problemTxt,
    {
      textReplace: [[/\\\\/, '\\']]
    }
  )
  return `# Problem ${n}

  ${problemMd}
`
}
