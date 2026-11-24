import java.util.*;

public class WordCount {
    public static Map<String, Integer> count(String text) {
        Map<String, Integer> counts = new TreeMap<>();
        for (String word : text.toLowerCase().split("\\W+")) {
            if (word.isEmpty()) continue;
            counts.merge(word, 1, Integer::sum);
        }
        return counts;
    }

    public static List<String> top(Map<String, Integer> counts, int k) {
        List<String> words = new ArrayList<>(counts.keySet());
        words.sort((a, b) -> counts.get(b) - counts.get(a));
        return words.subList(0, Math.min(k, words.size()));
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        StringBuilder all = new StringBuilder();
        while (in.hasNextLine()) all.append(in.nextLine()).append(' ');
        Map<String, Integer> counts = count(all.toString());
        for (String w : top(counts, 3)) System.out.println(w + " " + counts.get(w));
    }
}
