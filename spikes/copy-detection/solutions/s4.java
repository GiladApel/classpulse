import java.io.*;
import java.util.*;

// Counts how often each word appears and prints the three most common ones.
public class TextStats {
    private final HashMap<String, Integer> occurrences = new HashMap<>();

    public void consume(String row) {
        StringTokenizer parts = new StringTokenizer(row, " .,;:!?\t");
        while (parts.hasMoreTokens()) {
            String piece = parts.nextToken().toLowerCase();
            Integer prev = occurrences.get(piece);
            occurrences.put(piece, prev == null ? 1 : prev + 1);
        }
    }

    public void showBest(int limit) {
        PriorityQueue<Map.Entry<String, Integer>> queue =
            new PriorityQueue<>((p, q) -> q.getValue() - p.getValue());
        queue.addAll(occurrences.entrySet());
        for (int j = 0; j < limit && !queue.isEmpty(); j++) {
            Map.Entry<String, Integer> item = queue.poll();
            System.out.println(item.getKey() + " " + item.getValue());
        }
    }

    public static void main(String[] args) throws IOException {
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in));
        TextStats stats = new TextStats();
        String row;
        while ((row = input.readLine()) != null) stats.consume(row);
        stats.showBest(3);
    }
}
