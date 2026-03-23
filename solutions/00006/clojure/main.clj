(let [square #(* % %)
      nums (range 1 101)
      squares (map square nums)
      square-sum (reduce + squares)
      sum (reduce + nums)
      sum-square (square sum)
      diff (- sum-square square-sum)]
  (println diff))
