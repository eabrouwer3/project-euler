import { number, select, input, confirm } from 'npm:@inquirer/prompts';
import { getLatestProblemId, getProblemMarkdown } from "./eulerApi.ts";
import { initializePythonSolution } from "./templates/python.ts";
import { initializeClojureSolution } from "./templates/clojure.ts";
import { initializeTypescriptSolution } from "./templates/typescript.ts";

async function dirExists(dir: string): Promise<boolean> {
  try {
    await Deno.lstat(dir)
    return true
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false
    }
    throw err
  }
}

enum Language {
  Python = 'python',
  Clojure = 'clojure',
  Typescript = 'typescript',
}

if (import.meta.main) {
  // Get all the problems
  const latestProblem = await getLatestProblemId()

  const problemNumber = await number({ message: 'Problem Number/ID', min: 1, max: latestProblem, required: true })
  const language = await select<Language>({
    message: 'Language',
    choices: Object.values(Language),
  })

  const problemDirName = problemNumber.toString().padStart(5, '0')
  const solutionDir = `${import.meta.dirname}/../solutions/${problemDirName}`
  if (!(await dirExists(solutionDir))) {
    await Deno.mkdir(solutionDir)
    const problemMd = await getProblemMarkdown(problemNumber)
    await Deno.writeFile(`${solutionDir}/PROBLEM.md`, new TextEncoder().encode(problemMd))
  }

  let solutionLanguageDir = `${solutionDir}/${language}`
  while (await dirExists(solutionLanguageDir)) {
    console.log(`Directory ${solutionLanguageDir} already exists!`)
    const cont = await confirm({ message: 'Continue with a new suffix?' })
    if (!cont) {
      throw new Error('[Failure!] Breaking out because of folder name mismatch')
    }
    const suffix = await input({ message: 'Suffix:' })
    solutionLanguageDir = `${solutionDir}/${language}-${suffix}`
  }

  await Deno.mkdir(solutionLanguageDir)
  switch (language) {
    case Language.Python: {
      await initializePythonSolution(problemNumber, solutionLanguageDir)
      break
    }
    case Language.Clojure: {
      await initializeClojureSolution(solutionLanguageDir)
      break
    }
    case Language.Typescript: {
      await initializeTypescriptSolution(solutionLanguageDir)
      break
    }
  }
}
