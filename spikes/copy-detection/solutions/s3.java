import java.util.*;
import java.util.stream.*;

public class Words {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        List<String> lines = new ArrayList<>();
        while (sc.hasNextLine()) lines.add(sc.nextLine());

        Map<String, Long> freq = lines.stream()
            .flatMap(l -> Arrays.stream(l.toLowerCase().split("[^a-z0-9]+")))
            .filter(w -> !w.isBlank())
            .collect(Collectors.groupingBy(w -> w, Collectors.counting()));

        freq.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(3)
            .forEach(e -> System.out.println(e.getKey() + " " + e.getValue()));
    }
}
