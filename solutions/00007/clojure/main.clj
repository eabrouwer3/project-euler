(ns main
  (:require [clojure.math :as math]))

(defn int-sqrt [x]
  (math/floor (math/sqrt x)))

(defn prime? [x]
  (let [nums (cons 2 (range 3 (int-sqrt x) 2))
        mods (map #(mod x %) nums)]
    (or (= x 2) (not (some zero? mods)))))

(defn primes
  ([] (primes 2))
  ([x] (if (prime? x)
         (lazy-seq (cons x (primes (+ x 2))))
         (lazy-seq (primes (+ x 2))))))


;; (println (nth (primes) 10001))
(println (take 5 (primes)))
