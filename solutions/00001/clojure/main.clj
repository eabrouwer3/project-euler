(let [multiple-of-3 (range 3 1000 3)
      multiples-of-5 (range 5 1000 5)
      all-multiples (set (concat multiple-of-3 multiples-of-5))]
  (println (reduce + all-multiples)))
