if __name__ == "__main__":
    multiples_of_3 = {x for x in range(3, 1000, 3)}
    multiples_of_5 = {x for x in range(5, 1000, 5)}
    all_multiples = multiples_of_3.union(multiples_of_5)
    total_sum = sum(all_multiples)
    print(total_sum)
