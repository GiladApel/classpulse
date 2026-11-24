import java.util.*;

public class Main {
    static String[] tokenize(String s) {
        return s.replaceAll("[^A-Za-z ]", " ").toLowerCase().trim().split(" +");
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        Map<String, Integer> map = new HashMap<>();
        while (scanner.hasNextLine()) {
            for (String t : tokenize(scanner.nextLine())) {
                if (t.length() > 0) map.put(t, map.getOrDefault(t, 0) + 1);
            }
        }
        String[] keys = map.keySet().toArray(new String[0]);
        Arrays.sort(keys, (a, b) -> map.get(b) != map.get(a) ? map.get(b) - map.get(a) : a.compareTo(b));
        for (int i = 0; i < 3 && i < keys.length; i++) {
            System.out.println(keys[i] + " " + map.get(keys[i]));
        }
    }
}
