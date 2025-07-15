const DENO_JSON = '{}'

const MAIN_TS = `if (import.meta.main) {
  console.log('Hello, World!')
}
`

const README = `# Running This Typescript Solution

## Install Deno

<https://docs.deno.com/runtime/getting_started/installation/>

On Mac, just run

\`\`\`sh
brew install deno
\`\`\`

## Run Code

\`\`\`sh
deno run main.ts
\`\`\`
`

export async function initializeTypescriptSolution(dir: string) {
  const encoder = new TextEncoder()
  await Deno.writeFile(`${dir}/deno.json`, encoder.encode(DENO_JSON))
  await Deno.writeFile(`${dir}/main.ts`, encoder.encode(MAIN_TS))
  await Deno.writeFile(`${dir}/README.md`, encoder.encode(README))

  console.log(`Python solution initialized at ${dir}`)
}
