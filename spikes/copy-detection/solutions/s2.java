import java.io.*;
import java.util.*;

public class Frequency {
    private final HashMap<String, Integer> table = new HashMap<>();

    public void add(String line) {
        StringTokenizer st = new StringTokenizer(line, " .,;:!?\t");
        while (st.hasMoreTokens()) {
            String token = st.nextToken().toLowerCase();
            Integer old = table.get(token);
            table.put(token, old == null ? 1 : old + 1);
        }
    }

    public void printTop(int n) {
        PriorityQueue<Map.Entry<String, Integer>> heap =
            new PriorityQueue<>((x, y) -> y.getValue() - x.getValue());
        heap.addAll(table.entrySet());
        for (int i = 0; i < n && !heap.isEmpty(); i++) {
            Map.Entry<String, Integer> e = heap.poll();
            System.out.println(e.getKey() + " " + e.getValue());
        }
    }

    public static void main(String[] args) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        Frequency f = new Frequency();
        String line;
        while ((line = reader.readLine()) != null) f.add(line);
        f.printTop(3);
    }
}
