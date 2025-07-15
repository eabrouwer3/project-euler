const MAIN_CLJ = '(println "Hello, World!")'

const README = `# Running This Clojure Solution

## Install Clojure

<https://clojure.org/guides/install_clojure>

On Mac, just run

\`\`\`sh
brew install clojure/tools/clojure
\`\`\`

## Run Code

\`\`\`sh
clj -M main.clj
\`\`\`
`

export async function initializeClojureSolution(dir: string) {
  const encoder = new TextEncoder()
  await Deno.writeFile(`${dir}/main.clj`, encoder.encode(MAIN_CLJ))
  await Deno.writeFile(`${dir}/README.md`, encoder.encode(README))

  console.log(`Clojure solution initialized at ${dir}`)
}
