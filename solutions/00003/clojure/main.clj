(ns main
  (:require [clojure.math :as math]))

(defn int-sqrt [x]
  (math/floor (math/sqrt x)))

(defn prime? [x]
  (let [nums (cons 2 (range 3 (int-sqrt x) 2))
        mods (map #(mod x %) nums)]
    (not (some zero? mods))))

(defn prime-factors
  ([x] (prime-factors x (if (even? x) (dec (/ x 2)) (dec (/ (dec x) 2)))))
  ([x n] (if (zero? n)
           '(0)
           (if (and (zero? (mod x n)) (prime? x))
             (lazy-seq (cons x (prime-factors x (- n 2))))
             (lazy-seq (prime-factors x (- n 2)))))))

(println (prime-factors 13195))
